import {Octokit} from "@octokit/rest"
import {Option, program} from "commander"
import {fileURLToPath} from "url"
import path from "path"
import fs from "fs"

const releaseToken = process.env.GITHUB_TOKEN

if (!releaseToken) {
	throw new Error("No GITHUB_TOKEN set!")
}

const OCTOKIT = OctokitWrapper({
	auth: releaseToken,
	userAgent: 'tuta-github-release-v0.0.1',
	owner: "tutao",
	repo: "tutanota",
})

const wasRunFromCli = fileURLToPath(import.meta.url).startsWith(process.argv[1])

if (wasRunFromCli) {
	program
		.requiredOption('--tag <tag>', "The commit tag to reference")
		.option('--milestone <milestone>', "Milestone to reference")
		.option('--releaseName <releaseName>', "Name of the release")
		.addOption(
			new Option("--platform <platform>", 'Which platform to build')
				.choices(["android", "ios", "desktop", "all"])
				.default("all")
		)
		.option('--uploadFile <filePath>', "Path to a file to upload")
		.option('--apkChecksum <checksum>', "Checksum for the APK")
		.option('--toFile <toFile>', "If provided, the release notes will be written to the given file path. Implies `--dryRun`")
		.option('--dryRun', "Don't make any changes to github")
		.option('--format <format>', "Format to generate notes in", "github")
		.option('--existing', "reference an existing release notes page rather than creating a new one")
		.option('--append <text>', "extra text to append to the bottom of the release notes")
		.action(async (options) => {
			await createReleaseNotes(options)
		})
		.parseAsync(process.argv)
}

async function createReleaseNotes(
	{
		releaseName,
		milestone,
		tag,
		platform,
		uploadFile,
		apkChecksum,
		toFile,
		dryRun,
		format,
		existing,
		append
	}
) {
	if (!existing && !milestone) {
		throw new Error("--milestone must be provided in order to create a new release. Specify --existing otherwise")
	}

	const shouldUpload = !dryRun && !toFile

	let releaseId, uploadUrl, releaseNotes

	if (!existing) {
		const githubMilestone = await getMilestone(milestone)
		const issues = await getIssuesForMilestone(githubMilestone)
		const {bugs, other} = sortIssues(filterIssues(issues, platform))
		releaseNotes = format === "ios"
			? renderIosReleaseNotes(bugs, other)
			: renderGithubReleaseNotes({
				milestoneUrl: githubMilestone.html_url,
				bugIssues: bugs,
				otherIssues: other,
				apkChecksum: apkChecksum
			})

		console.log("Release notes:")
		console.log(releaseNotes)

		if (shouldUpload) {
			console.log("Creating release at: ", createDraftResponse.html_url)
			const result = await createReleaseDraft(releaseName ?? tag, tag, releaseNotes)
			releaseId = result.id
			uploadUrl = result.upload_url
		} else if (toFile) {
			console.log(`writing release notes to ${toFile}`)
			await fs.promises.writeFile(toFile, releaseNotes, "utf-8")
		}
	} else {
		const release = await getExistingReleaseByTagName(tag)
		uploadUrl = release.upload_url
		releaseId = release.id
		releaseNotes = release.body
	}

	if (shouldUpload && uploadFile) {
		console.log(`Uploading asset "${uploadFile} to ${uploadUrl}"`)
		await uploadAsset(uploadUrl, releaseId, uploadFile)
	}

	if (append && existing) {
		const newBody = `${releaseNotes}\n${append}`
		console.log(`Updating release body to ${newBody}`)
		await updateReleaseBody(
			releaseId,
			newBody
		)
	}
}

/**
 * Filter the issues for the given platform.
 * If an issue has no label, then it will be included
 * If an issue has a label for a different platform, it won't be included,
 * _unless_ it also has the label for the specified paltform
 */
function filterIssues(issues, platform) {

	const allPlatforms = ["android", "ios", "desktop"]

	if (platform === "all") {
		return issues
	} else if (allPlatforms.includes(platform)) {
		const otherPlatforms = allPlatforms.filter(p => p !== platform)
		return issues.filter(issue =>
			issue.labels.some(label => label.name === platform) ||
			!issue.labels.some(label => otherPlatforms.includes(label.name))
		)
	} else {
		throw new Error(`Invalid value "${platform}" for "platform"`)
	}
}

/**
 *  Sort issues into bug issues and other issues
 */
function sortIssues(issues) {
	const bugs = []
	const other = []
	for (const issue of issues) {
		const isBug = issue.labels.find(l => l.name === "bug" || l.name === "dev bug")
		if (isBug) {
			bugs.push(issue)
		} else {
			other.push(issue)
		}
	}
	return {bugs, other}
}

function renderGithubReleaseNotes({milestoneUrl, bugIssues, otherIssues, apkChecksum}) {
	const whatsNewListRendered = otherIssues.map(issue => {
		return ` - ${issue.title} #${issue.number}`
	}).join("\n")

	const bugsListRendered = bugIssues.map(issue => {
		return ` - ${issue.title} #${issue.number}`
	}).join("\n")

	const milestoneUrlObject = new URL(milestoneUrl)
	milestoneUrlObject.searchParams.append("closed", "1")

	const apkSection = apkChecksum ? `# APK Checksum\nSHA256: ${apkChecksum}` : ""

	return `
# What's new
${whatsNewListRendered}

# Bugfixes
${bugsListRendered}

# Milestone
${milestoneUrlObject.toString()}

${apkSection}
`.trim()
}

function renderIosReleaseNotes(bugs, rest) {
	return `
what's new:
${rest.map(issue => issue.title).join("\n")}

bugfixes:
${bugs.map(issue => issue.title).join("\n")}`.trim()
}

async function getMilestone(milestoneName) {
	const milestones = await OCTOKIT.issues.listMilestones({
		direction: "desc",
		state: "all"
	})

	const milestone = milestones.find(m => m.title === milestoneName)

	if (milestone) {
		return milestone
	} else {
		const titles = milestones.map(m => m.title)
		throw new Error(`No milestone named ${milestoneName} found. Milestones: ${titles.join(", ")}`)
	}
}

async function getIssuesForMilestone(milestone) {
	return OCTOKIT.issues.listForRepo({
		milestone: milestone.number,
		state: "all"
	})
}

async function createReleaseDraft(name, tag, body) {
	return OCTOKIT.repos.createRelease({
		draft: true,
		name,
		tag_name: tag,
		body,
	})
}

async function updateReleaseBody(releaseId, body) {
	return OCTOKIT.repos.updateRelease({
		release_id: releaseId,
		body
	})
}

async function getExistingReleaseByTagName(tagName) {
	return OCTOKIT.repos.getReleaseByTag({
		tag: tagName
	})
}

async function uploadAsset(uploadUrl, releaseId, assetPath) {
	return OCTOKIT.repos.uploadReleaseAsset({
		release_id: releaseId,
		data: await fs.promises.readFile(assetPath),
		name: path.basename(assetPath),
		upload_url: uploadUrl
	})
}

function OctokitWrapper({auth, userAgent, owner, repo}) {
	const handler = {
		get: (target, prop, receiver) => new Proxy(Reflect.get(target, prop, receiver), handler),
		apply: async (target, receiver, [params]) => {
			const response = await Reflect.apply(
				target,
				receiver,
				[
					{
						owner,
						repo,
						...params
					}
				]
			)
			return response.data
		}
	}
	return new Proxy(new Octokit({auth, userAgent}), handler)
}
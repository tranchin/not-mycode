import {globby} from "zx"
import fs from "fs-extra"
import {fileExists} from "./buildUtils.js"
import path from "path"
import {fileURLToPath} from "url"

if (fileURLToPath(import.meta.url) === process.argv[1]) {
	await checkOfflineDatabaseMigrations()
}

/**
 * Check that there is a developer defined offline database migration for the most recent incompatible model version change
 */
export async function checkOfflineDatabaseMigrations() {
	const MIGRATIONS_DIRECTORY = "src/api/worker/offline/migrations"
	const MIGRATOR_PATH = "src/api/worker/offline/Migrator.ts"

	const schemas = await globby("schemas/*.json")

	const missingMigrations = []
	const unusedMigrations = []
	for (const schema of schemas) {
		const {app, versions} = await fs.readJSON(schema)

		for (const {version} of versions) {

			const expectedMigrationName = `${app}-v${version}`

			if (!await fileExists(path.join(MIGRATIONS_DIRECTORY, `${expectedMigrationName}.ts`))) {
				// If an incompatible model change doesn't have a corresponding migration, that is an error
				missingMigrations.push(expectedMigrationName)
			} else {
				// if a migration exists but it is not used, that is an error
				const migratorSource = await fs.readFile(MIGRATOR_PATH, "utf-8")
				if (!migratorSource.includes(`${expectedMigrationName}.js`)) {
					unusedMigrations.push(`${expectedMigrationName}`)
				}
			}
		}
	}

	let error = false

	if (missingMigrations.length > 0) {
		error = true
		console.error(`Missing the following offline database migrations:
${missingMigrations.join("\n")}.
Please add them to ${MIGRATIONS_DIRECTORY}.`
		)
	}

	if (unusedMigrations.length > 0) {
		error = true
		console.error(`The following offline database migrations exist but are unused:\n${unusedMigrations.join("\n")}.
Please use them in ${MIGRATOR_PATH}`)
	}

	if (error) {
		throw new Error("Please attend to the offline database")
	}
}
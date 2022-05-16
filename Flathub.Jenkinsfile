pipeline {
	environment {
		NODE_PATH = "/opt/node-v16.3.0-linux-x64/bin"
		REPO_URL = 'git@github.com:flathub/com.tutanota.Tutanota.git'
		VERSION = sh(returnStdout: true, script: "${NODE_PATH}/node -p -e \"require('./package.json').version\" | tr -d \"\n\"")
		GITHUB_RELEASE_PAGE = "https://github.com/tutao/tutanota/releases/tag/tutanota-desktop-release-${VERSION}"

		// ./generate.sh opens up an editor with the changelog using $VISUAL
		VISUAL = '/usr/bin/cat'

		// synchronised with ./generate.bash
		TAG = "tutanota-desktop-release-${VERSION}"
		ARCHIVE = "tutanota-desktop-${VERSION}-unpacked-linux.tar.gz"
		URL = "https://github.com/tutao/tutanota/releases/download/${TAG}/${ARCHIVE}"
	}

	agent {
		label 'linux'
	}

	stages {
		stage('Generate flatpak release') {
			steps {
				checkout changelog: false,
						poll: false,
						scm: [
								$class           : 'GitSCM', branches: [[name: '*/master']],
								extensions       : [],
								userRemoteConfigs: [[url: REPO_URL]]
						]

				sh 'cd com.tutao.Tutanota'
				sh './generate.bash'

				script {
					withCredentials([string(credentialsId: 'github-access-token', variable: 'GITHUB_TOKEN')]) {
						sh """node buildSrc/releaseNotes.js \
							--tag '${TAG}' \
							--uploadFile '${WORKSPACE}/${ARCHIVE}'\
							--append '\
# TAR CHECKSUM\
SHA256: `sha256sum ${ARCHIVE} | head -c64`'"""
					}
				}
			}
		}
	}
}

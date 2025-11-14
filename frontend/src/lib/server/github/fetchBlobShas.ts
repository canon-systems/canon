// We import the Octokit class from the GitHub SDK
// This is a helper that talks to the GitHub API for us
import { Octokit } from '@octokit/rest'

// Here we create one Octokit client
// Think of this as a phone that calls GitHub
// The auth token is the password for that phone
// The token must be set as an environment variable named GITHUB_TOKEN
// You set this in your project config so it is not hard coded
const octokit = new Octokit({
    // process.env.GITHUB_TOKEN gets the value from the environment
    // If this is missing, the API calls for private repos will fail
    auth: process.env.GITHUB_TOKEN
})

// We define the shape of the parameters this function expects
// It needs the repo owner, the repo name, the commit SHA and a list of file paths
type FetchGitHubFileShasParams = {
    repo_owner: string
    repo_name: string
    commit_sha: string
    file_paths: string[]
}

// We export a function so other files can use it
// The function returns a Promise that resolves to a map
// The map keys are file paths and the values are the hash for that file
export async function fetchGitHubFileShas(
    params: FetchGitHubFileShasParams
): Promise<Record<string, string | null>> {
    // We pull the values out of the params object for easier use
    const { repo_owner, repo_name, commit_sha, file_paths } = params

    // This result object will hold filePath -> fileHash pairs
    const result: Record<string, string | null> = {}

    // We loop over every file path that was selected in the submission
    for (const path of file_paths) {
        try {
            // Here we call GitHub "getContent" endpoint
            // We ask for the content information of this file at the given commit
            // owner is the GitHub user or organization
            // repo is the name of the repository
            // path is the file path in the repo
            // ref is the commit SHA that we want to inspect
            const { data } = await octokit.repos.getContent({
                owner: repo_owner,
                repo: repo_name,
                path,
                ref: commit_sha
            })

            // The API can return an array or an object
            // For a single file we expect an object
            // We check if it is not an array and if its type is file
            if (!Array.isArray(data) && data.type === 'file') {
                // data.sha is the blob SHA
                // This is the hash that represents the exact content of the file
                // If the file content changes, this sha value will change too
                result[path] = data.sha
            } else {
                // If we got something unexpected, we still record it
                // but we store null as the hash so we know it did not resolve
                result[path] = null
            }
        } catch (error) {
            // If the API call fails, we log an error to the server console
            // For example, maybe the file path does not exist at that commit
            console.error(`Failed to get blob SHA for ${path}:`, error)
            // We still add an entry so the caller knows this file did not get a hash
            result[path] = null
        }
    }

    // Once the loop finishes, we return the whole map of file paths to hashes
    return result
}
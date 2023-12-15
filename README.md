# wait-for-workflow:

To update and release: 

Create a new branch.
Make edits to /index.ts, then run 'ncc build index.ts -o dist' to create /dist/index.js for
 the action file to locate and run.

push and merge, then do a release, Example:

git tag -a v1.0.1 -m "change version ot match package.json"
git push origin v1.0.1

go to release tab in repo and publish.

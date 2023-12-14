# wait-for-workflow
Edit /index.js
Run ncc build index.js -o dist

push and merge, then do a release

git tag -a v1.0.1 -m "change version ot match package.json"
git push origin v1.0.1

go to release tab in repo and publish

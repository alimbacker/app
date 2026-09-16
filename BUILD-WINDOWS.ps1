$ErrorActionPreference='Stop'
Write-Host 'Installing dependencies...'
npm install
Write-Host 'Building AllBee Focus...'
npm run build
Write-Host 'Build complete. Check the dist/ folder and release/ output.'

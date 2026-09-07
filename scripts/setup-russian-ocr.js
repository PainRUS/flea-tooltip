const fs = require("fs");
const https = require("https");
const path = require("path");

const destination = path.join(__dirname, "..", "lib", "ocr", "rus.traineddata");
const sourceUrl =
  "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/rus.traineddata";

function download(url, outputPath, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location &&
          redirectsLeft > 0
        ) {
          response.resume();
          download(response.headers.location, outputPath, redirectsLeft - 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Download failed with HTTP ${response.statusCode}`));
          return;
        }

        const tempPath = `${outputPath}.download`;
        const output = fs.createWriteStream(tempPath);
        response.pipe(output);
        output.on("finish", () => {
          output.close(() => {
            fs.renameSync(tempPath, outputPath);
            resolve();
          });
        });
        output.on("error", reject);
      })
      .on("error", reject);
  });
}

async function main() {
  fs.mkdirSync(path.dirname(destination), { recursive: true });

  if (fs.existsSync(destination) && fs.statSync(destination).size > 100000) {
    console.log(`Russian OCR data already exists: ${destination}`);
    return;
  }

  console.log("Downloading official Tesseract Russian language data...");
  await download(sourceUrl, destination);
  console.log(`Russian OCR data saved to: ${destination}`);
}

main().catch((error) => {
  console.error("Failed to install Russian OCR data:", error.message);
  process.exitCode = 1;
});

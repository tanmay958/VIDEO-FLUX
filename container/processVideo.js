const { exec } = require("child_process");
const AWS = require("aws-sdk");
const fs = require("fs");

AWS.config.update({ region: "your-region" });
const s3 = new AWS.S3();

const bucketName = "your-s3-bucket";
const inputKey = "path/to/input/video.mp4";
const outputKey = "path/to/output/processed-video.mp4";
const localInputPath = "/app/input-video.mp4";
const localOutputPath = "/app/output-video.mp4";

// Download the video from S3
const downloadFromS3 = async () => {
  const params = {
    Bucket: bucketName,
    Key: inputKey,
  };

  const file = fs.createWriteStream(localInputPath);
  return new Promise((resolve, reject) => {
    s3.getObject(params)
      .createReadStream()
      .pipe(file)
      .on("close", resolve)
      .on("error", reject);
  });
};

// Process the video with FFmpeg
const processVideo = () => {
  return new Promise((resolve, reject) => {
    exec(
      `ffmpeg -i ${localInputPath} -vf "scale=1280:720" ${localOutputPath}`,
      (error, stdout, stderr) => {
        if (error) {
          return reject(`Error processing video: ${stderr}`);
        }
        resolve(stdout);
      }
    );
  });
};

// Upload the processed video back to S3
const uploadToS3 = async () => {
  const fileContent = fs.readFileSync(localOutputPath);

  const params = {
    Bucket: bucketName,
    Key: outputKey,
    Body: fileContent,
  };

  return s3.upload(params).promise();
};

// Main function to run the steps
const main = async () => {
  try {
    console.log("Downloading video from S3...");
    await downloadFromS3();
    console.log("Processing video with FFmpeg...");
    await processVideo();
    console.log("Uploading processed video to S3...");
    await uploadToS3();
    console.log("Video processing complete.");
  } catch (error) {
    console.error("Error:", error);
  }
};

main();

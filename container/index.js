import express from "express";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { exec } from "child_process";
import util from "util";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import cors from "cors";
dotenv.config();

const execPromise = util.promisify(exec);
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
console.log("cors allowed");

// Initialize the S3 client
const s3 = new S3Client({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.IAM_KEY,
    secretAccessKey: process.env.IAM_SECRET_KEY,
  },
});

// Middleware to parse JSON requests
app.use(express.json());

// Endpoint to process video
app.post("/process-video", async (req, res) => {
  console.log(req.body);
  const { bucketName, key } = req.body;

  if (!bucketName || !key) {
    return res.status(400).json({ error: "bucketName and key are required." });
  }

  const timestamp = new Date().toISOString().replace(/:/g, "-").split(".")[0]; // Create a timestamp for the folder
  const outputFolder = `output_${timestamp}`;
  const localInputFilePath = path.join("/tmp", key); // Temporary location for input file
  const outputBucket = "prod-tanmay"; // Set your output bucket name here

  try {
    // Step 1: Download the input file from S3 to local
    const downloadParams = {
      Bucket: bucketName,
      Key: key,
    };

    const { Body } = await s3.send(new GetObjectCommand(downloadParams));

    // Create a writable stream to save the downloaded file
    const writeStream = fs.createWriteStream(localInputFilePath);
    // Pipe the S3 response stream to the writable stream
    Body.pipe(writeStream);

    // Wait for the stream to finish
    await new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });

    // Step 2: Create output directory for HLS files
    const outputDirectory = path.join("/tmp", outputFolder);
    fs.mkdirSync(outputDirectory, { recursive: true });

    // Step 3: Define the ffmpeg command for HLS conversion
    const ffmpegCommand = `
      ffmpeg -i ${localInputFilePath} \
      -preset veryfast \
      -g 30 \
      -sc_threshold 0 \
      -b:v:0 800k -s:0 640x360 -maxrate:0 800k -bufsize:0 1600k -b:a:0 128k \
      -b:v:1 1400k -s:1 854x480 -maxrate:1 1400k -bufsize:1 2800k -b:a:1 128k \
      -b:v:2 3500k -s:2 1280x720 -maxrate:2 3500k -bufsize:2 7000k -b:a:2 128k \
      -f hls \
      -hls_time 10 \
      -hls_list_size 0 \
      -hls_segment_filename "${outputDirectory}/segment_%03d.ts" \
      "${outputDirectory}/output_%v.m3u8"`;

    // Step 4: Run the ffmpeg command
    await execPromise(ffmpegCommand);

    // Step 5: Upload the HLS output files to S3
    const uploadFiles = async (folder) => {
      const files = fs.readdirSync(folder);

      for (const file of files) {
        const filePath = path.join(folder, file);
        const uploadParams = {
          Bucket: outputBucket,
          Key: `${outputFolder}/${file}`,
          Body: fs.createReadStream(filePath),
        };
        await s3.send(new PutObjectCommand(uploadParams));
      }
    };

    // Upload the generated HLS files
    await uploadFiles(outputDirectory);

    // Step 6: Cleanup: Delete the temporary files
    fs.unlinkSync(localInputFilePath); // Delete the downloaded input file
    fs.rmdirSync(outputDirectory, { recursive: true }); // Delete the output directory

    return res.status(200).json({
      message: "Video processed and uploaded successfully.",
      outputFolder: outputFolder,
    });
  } catch (error) {
    console.error("Error processing video:", error);

    // Cleanup in case of an error
    if (fs.existsSync(localInputFilePath)) {
      fs.unlinkSync(localInputFilePath); // Delete the file if it exists
    }
    if (fs.existsSync(outputDirectory)) {
      fs.rmdirSync(outputDirectory, { recursive: true }); // Delete the output directory if it exists
    }

    return res.status(500).json({ error: "Error processing video." });
  }
});
app.get("/", (req, res) => {
  res.send("pinging server");
});
// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

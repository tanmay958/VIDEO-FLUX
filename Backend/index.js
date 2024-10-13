import express from "express";
import Docker from "dockerode";
import cors from "cors";
import { exec } from "child_process";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  ReceiveMessageCommand,
  SQSClient,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import multerS3 from "multer-s3";
import multer from "multer";
import dotenv from "dotenv";
const docker = new Docker({ socketPath: "/var/run/docker.sock" });
dotenv.config();

const app = express();
app.use(cors());

// Create S3 client
const s3 = new S3Client({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.IAM_KEY,
    secretAccessKey: process.env.IAM_SECRET_KEY,
  },
});
const sqs = new SQSClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.IAM_KEY,
    secretAccessKey: process.env.IAM_SECRET_KEY,
  },
});
// Configure multer to use S3
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: "raw-vidoes-tanmay99", // Replace with your bucket name
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      cb(null, Date.now().toString() + "-" + file.originalname); // Unique file name
    },
  }),
});

// Upload endpoint
app.post("/upload", upload.single("file"), (req, res) => {
  console.log("file uploaded");
  res.send({
    message: "File uploaded successfully!",
    fileUrl: req.file.location, // The file's URL on S3
  });
});

app.get("/start-polling", async (req, res) => {
  console.log("Polling started");
  const s3Details = []; // Array to hold S3 object details
  let hasMessages = true; // Flag to indicate if there are messages in the queue

  const command = new ReceiveMessageCommand({
    QueueUrl:
      "https://sqs.us-east-1.amazonaws.com/158050815375/raw-videos-queue",
    MaxNumberOfMessages: 10, // Fetch up to 10 messages at once
    WaitTimeSeconds: 5,
  });

  while (hasMessages) {
    try {
      const { Messages } = await sqs.send(command);

      // Check if there are messages
      if (!Messages || Messages.length === 0) {
        hasMessages = false; // No more messages, exit the loop
        break;
      }

      for (const message of Messages) {
        const { Body, ReceiptHandle } = message;
        if (!Body) continue;

        // Parse the body to get the S3 event details
        const event = JSON.parse(Body);

        // Check if the message is an S3 event notification
        if (event.Records && event.Records.length > 0) {
          for (const record of event.Records) {
            if (record.s3) {
              const bucketName = record.s3.bucket.name;
              const key = record.s3.object.key;

              // Add the bucket name and key to the list
              s3Details.push({ bucketName, key });
            }
          }
        }

        // Delete the message from the queue
        await sqs.send(
          new DeleteMessageCommand({
            QueueUrl: process.env.QUEUE_URL,
            ReceiptHandle: ReceiptHandle,
          })
        );
      }
    } catch (error) {
      console.error("Error polling SQS messages:", error);
      hasMessages = false; // Stop polling on error
    }
  }

  // Return the list of S3 object details
  res.json(s3Details);
});

// spin the container
app.get("/start-container", (req, res) => {
  const containerName = "called_container";
  const serverUrl = "http://localhost:3001"; // Change this to the server's URL inside the container

  const command = `docker run -d --name ${containerName} -p 3001:3001 fresh-image2`;

  exec(command, async (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing command: ${error}`);
      return res.status(500).send(`Error: ${error.message}`);
    }
    if (stderr) {
      console.error(`Command error: ${stderr}`);
      return res.status(500).send(`Error: ${stderr}`);
    }

    console.log(`Container started: ${stdout}`);

    // Poll the server endpoint to check if it's accessible
    const maxRetries = 10;
    let retries = 0;
    let serverIsUp = false;

    while (retries < maxRetries) {
      try {
        // Make a GET request to the server inside the container
        await new Promise((resolve, reject) => {
          setTimeout(() => {
            fetch(serverUrl)
              .then((response) => {
                if (response.ok) {
                  serverIsUp = true;
                  resolve();
                } else {
                  reject();
                }
              })
              .catch(reject);
          }, 1000); // Wait for 1 second between retries
        });

        if (serverIsUp) {
          break;
        }
      } catch (err) {
        retries++;
        console.log(`Retrying... (${retries}/${maxRetries})`);
      }
    }

    if (!serverIsUp) {
      return res
        .status(500)
        .send("Server is not accessible after starting the container.");
    }

    // If the server is up and running, send a response to the frontend
    return res.send("Container and server are both up and running.");
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.send("Welcome to the file upload service!");
});
const generatePresignedUrl = async (fileName) => {
  // Remove spaces and append current date-time to the filename

  const extensionIndex = fileName.lastIndexOf("."); // Find the last occurrence of the dot
  const nameWithoutSpaces = fileName
    .slice(0, extensionIndex)
    .replace(/\s+/g, "_"); // Replace spaces in the name
  const extension = fileName.slice(extensionIndex); // Get the extension (including the dot)

  // Use Date.now() for the current timestamp
  const timestamp = Date.now(); // Get the current timestamp

  const cleanedFileName = `${timestamp}_${nameWithoutSpaces}${extension}`;

  const command = new PutObjectCommand({
    Bucket: "raw-vidoes-tanmay99", // Replace with your bucket name
    Key: cleanedFileName,
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 3600 }); // URL valid for 1 hour
  return { url, key: cleanedFileName };
};

// New endpoint to get a pre-signed URL

app.get("/generate-presigned-url", async (req, res) => {
  try {
    const { fileName } = req.query;
    if (!fileName) {
      return res.status(400).send("File name is required.");
    }

    const { url, key } = await generatePresignedUrl(fileName);
    res.json({ url, key });
  } catch (error) {
    console.error("Error generating pre-signed URL:", error);
    res.status(500).send("Could not generate pre-signed URL.");
  }
});
// Add this new endpoint in your Express server
app.delete("/delete-container", (req, res) => {
  const containerName = "called_container"; // Replace with your actual container name

  // Command to stop and remove the container
  const command = `docker stop ${containerName} && docker rm ${containerName}`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing command: ${error}`);
      return res.status(500).send(`Error: ${error.message}`);
    }
    if (stderr) {
      console.error(`Command error: ${stderr}`);
      return res.status(500).send(`Error: ${stderr}`);
    }

    console.log(`Container stopped and removed: ${stdout}`);
    return res.send("Container stopped and removed successfully.");
  });
});

// Start server
app.listen(3003, () => {
  console.log("server started on http://localhost:3003");
});

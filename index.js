import {
  ReceiveMessageCommand,
  SQSClient,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import "dotenv/config";
import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";
const client = new SQSClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.IAM_KEY,
    secretAccessKey: process.env.IAM_SECRET_KEY,
  },
});

const ecsclient = new ECSClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.ECS_IAM_KEY,
    secretAccessKey: process.env.ECS_IAM_SECRET_KEY,
  },
});
async function init() {
  const command = new ReceiveMessageCommand({
    QueueUrl:
      "https://sqs.us-east-1.amazonaws.com/158050815375/raw-videos-queue",
    MaxNumberOfMessages: 1,
    WaitTimeSeconds: 5,
  });

  while (true) {
    const { Messages } = await client.send(command);
    if (!Messages) {
      console.log(`No message in queue`);
      continue;
    }

    try {
      for (const message of Messages) {
        const { MessageId, Body } = message;
        if (!Body) continue;

        // Parse the body as a JSON event
        const event = JSON.parse(Body);

        // Check if this is an S3 event
        if (event.Records && event.Records.length > 0) {
          for (const record of event.Records) {
            if (record.eventSource === "aws:s3") {
              const s3Event = record.s3;

              const bucketName = s3Event.bucket.name;
              const objectKey = decodeURIComponent(
                s3Event.object.key.replace(/\+/g, " ")
              );
              const objectSize = s3Event.object.size;
              const runTaskCOmmand = new RunTaskCommand({
                taskDefinition:
                  "arn:aws:ecs:us-east-1:158050815375:task-definition/video-transoder:1",
                cluster:
                  "arn:aws:ecs:us-east-1:158050815375:cluster/CONTAINER_TANMAY",
                launchType: "FARGATE",
                networkConfiguration: {
                  awsvpcConfiguration: {
                    securityGroups: ["sg-08a8f611e59e1a2a5"],
                    assignPublicIp: "ENABLED",

                    subnets: [
                      "subnet-054e6c84efd54c128",
                      "subnet-09ba79d372aec64f0",
                      "subnet-03b8556d0481f2fe5",
                      "subnet-0018d48d101513bd0",
                      "subnet-011f8385f5c275b66",
                      "subnet-08420ecafa56eed3a",
                    ],
                  },
                },
                overrides: {
                  containerOverrides: [
                    {
                      name: "video-transcoder",
                      environment: [
                        { name: "BUCKET", value: bucketName },
                        { name: "KEY", value: objectKey },
                      ],
                    },
                  ],
                },
              });
              await ecsclient.send(runTaskCOmmand);
              console.log("ECS Spinned off");
              await client.send(
                new DeleteMessageCommand({
                  QueueUrl: process.env.QUEUE_URL,
                  ReceiptHandle: message.ReceiptHandle,
                })
              );
              console.log(`S3 Event received:`);
              console.log(`Bucket: ${bucketName}`);
              console.log(`Object Key: ${objectKey}`);
              console.log(`Object Size: ${objectSize}`);
            }
          }
        } else {
          console.log("test command");
          await client.send(
            new DeleteMessageCommand({
              QueueUrl: process.env.QUEUE_URL,
              ReceiptHandle: message.ReceiptHandle,
            })
          );
        }
      }
    } catch (er) {
      console.error("Error processing SQS message:", er);
    }
  }
}

init();

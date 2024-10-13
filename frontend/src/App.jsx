import BulletPoints from "./components/BulletPoints";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import axios from "axios"; // Import Axios
import "video.js/dist/video-js.css"; // Import Video.js styles

export default function App() {
  const [fileName, setFileName] = useState("Upload File");
  const [isProcessing, setIsProcessing] = useState(false); // State for processing
  const [selectedFile, setSelectedFile] = useState(null); // State for the selected file
  const navigate = useNavigate();

  // JSON object to manage bullet point states
  const [steps, setSteps] = useState({
    step1: "",
    step2: "",
    step3: "",
    step4: "",
    step5: "",
  });

  // Function to update the state of a step
  const simulateStep = (step, status, delay) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        updateStep(step, status);
        resolve();
      }, delay);
    });
  };

  const updateStep = (step, status) => {
    setSteps((prevSteps) => ({
      ...prevSteps,
      [step]: status,
    }));
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setFileName(file.name);
      setSelectedFile(file);
    } else {
      setFileName("Upload File");
      setSelectedFile(null);
    }
  };

  const handleProcess = async () => {
    // Check if a file is selected
    if (!selectedFile) {
      alert("Please select a file before processing."); // Alert if no file is selected
      return; // Exit the function if no file is selected
    }

    setIsProcessing(true); // Disable button
    try {
      // Start processing steps
      updateStep("step1", "ongoing");
      const { data } = await axios.get(
        "http://localhost:3003/generate-presigned-url",
        {
          params: {
            fileName: selectedFile.name,
            fileType: selectedFile.type,
          },
        }
      );

      const { url } = data;

      // Step 2: Upload the file directly to S3 using the pre-signed URL
      await axios.put(url, selectedFile, {
        headers: {
          "Content-Type": selectedFile.type,
        },
      });

      updateStep("step1", "completed");
      updateStep("step2", "ongoing");
      await simulateStep("step2", "completed", 100); // Simulating step completion
      updateStep("step3", "ongoing");
      const pollingResponse = await RequestMaker(
        "http://localhost:3003/start-polling"
      );
      updateStep("step3", "completed");
      updateStep("step4", "ongoing");
      await RequestMaker("http://localhost:3003/start-container");
      updateStep("step4", "completed");

      // Move to step 5
      updateStep("step5", "ongoing");
      const { bucketName, key } = pollingResponse.data[0];
      const videoObj = await postBucketData(bucketName, key);
      const { outputFolder } = videoObj.data;

      updateStep("step5", "completed");

      // Navigate to the Video Player page after getting the source
      navigate("/video-player", {
        state: {
          src: `https://prod-tanmay.s3.amazonaws.com/${outputFolder}/output_0.m3u8`,
        },
      });
    } catch (error) {
      console.error("Error during step processing:", error);
    } finally {
      setIsProcessing(false); // Re-enable button after processing
    }
  };

  // Function to make a POST request with the file using Axios

  // Function to make GET requests
  const RequestMaker = async (url) => {
    try {
      const response = await axios.get(url);
      if (Array.isArray(response.data) && response.data.length > 0) {
        const { bucketName, key } = response.data[0];
        return response;
      }
      console.log(response);
      return response;
    } catch (error) {
      console.error("Error fetching data:", error.message);
      throw error;
    }
  };

  const postBucketData = async (bucketName, key) => {
    try {
      const response = await axios.post("http://localhost:3001/process-video", {
        bucketName: bucketName,
        key: key,
      });

      console.log("Data posted successfully:", response.data);
      return response;
    } catch (error) {
      console.error("Error posting data:", error);
      throw error;
    }
  };

  return (
    <div className="w-full h-full flex">
      <div>
        <h1 className="font-fira font-extralight ml-14 mt-10 text-8xl">
          Videoflux
        </h1>
        <p className="font-Inconsolata mt-4 ml-16 font-extralight text-gray-600 text-xl">
          Convenient way to track transcoding of video files.
        </p>

        <form className="flex items-center ml-16 mt-4">
          <input
            id="fileInput"
            type="file"
            className="hidden"
            onChange={handleFileChange}
          />
          <label
            htmlFor="fileInput"
            className="cursor-pointer bg-blue-500 text-white px-4 py-1 rounded-md border border-blue-950"
          >
            {fileName}
          </label>

          {/* Button to start processing, disabled if processing */}
          <button
            type="button"
            className={`ml-4 bg-green-500 text-white px-4 py-1 rounded-md ${
              isProcessing ? "opacity-50 cursor-not-allowed" : ""
            }`}
            onClick={handleProcess}
            disabled={isProcessing} // Disable button when processing
          >
            {isProcessing ? "Processing..." : "Let's go"}
          </button>
        </form>

        <div className="ml-16 mt-8">
          <BulletPoints
            value="1"
            content="Uploading image to S3 bucket"
            state={steps.step1} // Step 1 state
            showLine={steps.step1 === "ongoing" || steps.step1 === "completed"} // Show line from 1 to 2
          />
          <BulletPoints
            value="2"
            content="Pushing event to SQS queue through registered event"
            state={steps.step2} // Step 2 state
            showLine={steps.step2 === "ongoing" || steps.step2 === "completed"} // Show line from 2 to 3
          />
          <BulletPoints
            value="3"
            content="Fetch message from SQS queue"
            state={steps.step3} // Step 3 state
            showLine={steps.step3 === "ongoing" || steps.step3 === "completed"} // Show line from 3 to 4
          />
          <BulletPoints
            value="4"
            content="Spinning up the docker container (local/ECS)"
            state={steps.step4} // Step 4 state
            showLine={steps.step4 === "ongoing" || steps.step4 === "completed"} // Show line from 4 to 5
          />
          <BulletPoints
            value="5"
            content="Transcoding video"
            state={steps.step5} // Step 5 state
          />
        </div>
      </div>
    </div>
  );
}

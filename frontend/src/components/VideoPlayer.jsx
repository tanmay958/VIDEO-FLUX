import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import videojs from "video.js";
import axios from "axios";

const VideoPlayer = () => {
  const videoRef = useRef(null);
  const location = useLocation();
  const { state } = location;
  const videoSrc = state ? state.src : "";

  useEffect(() => {
    // Call to delete the running container when the component is mounted
    const deleteContainer = async () => {
      try {
        const response = await axios.delete(
          "http://localhost:3003/delete-container"
        );
        console.log(response.data); // Log the success message
      } catch (error) {
        console.error("Error deleting the container:", error);
      }
    };

    deleteContainer(); // Call the delete function

    if (videoRef.current && videoSrc) {
      const player = videojs(videoRef.current, {
        controls: true,
        autoplay: true, // Enable autoplay
        preload: "auto",
        sources: [{ src: videoSrc, type: "application/x-mpegURL" }],
        responsive: true,
        fluid: true, // Makes the player responsive
      });

      // Enable fullscreen on player load
      player.on("ready", () => {
        player.requestFullscreen();
      });

      return () => {
        player.dispose();
      };
    }
  }, [videoRef, videoSrc]);

  return (
    <div
      className="video-player-container"
      style={{ width: "100vw", height: "100vh" }}
    >
      <video ref={videoRef} className="video-js vjs-big-play-centered" />
      {!videoSrc && <p>No video source provided.</p>}
    </div>
  );
};

export default VideoPlayer;

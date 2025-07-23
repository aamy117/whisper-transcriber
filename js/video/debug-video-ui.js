// Debug script for video-ui.js
console.log('===== Video UI Debug =====');

// Check if all required DOM elements exist
const requiredElements = {
  videoWrapper: 'videoWrapper',
  videoPlayerContainer: 'videoPlayerContainer',
  videoUploadArea: 'videoUploadArea',
  videoControls: 'videoControls',
  videoLoading: 'videoLoading',
  playPauseBtn: 'playPauseBtn',
  skipBackBtn: 'skipBackBtn',
  skipForwardBtn: 'skipForwardBtn',
  progressContainer: 'progressContainer',
  progressSlider: 'progressSlider',
  progressPlayed: 'progressPlayed',
  progressBuffered: 'progressBuffered',
  currentTime: 'currentTime',
  totalTime: 'totalTime',
  muteBtn: 'muteBtn',
  volumeSlider: 'volumeSlider',
  speedBtn: 'speedBtn',
  speedMenu: 'speedMenu',
  fullscreenBtn: 'fullscreenBtn',
  videoFileName: 'videoFileName',
  videoFileSize: 'videoFileSize',
  videoDuration: 'videoDuration',
  videoResolution: 'videoResolution'
};

console.log('Checking DOM elements...');
const missingElements = [];
for (const [name, id] of Object.entries(requiredElements)) {
  const element = document.getElementById(id);
  if (!element) {
    missingElements.push(id);
    console.error(`❌ Missing element: #${id}`);
  } else {
    console.log(`✅ Found element: #${id}`);
  }
}

if (missingElements.length > 0) {
  console.error(`\n⚠️ Missing ${missingElements.length} elements:`, missingElements);
} else {
  console.log('\n✅ All required elements found!');
}

// Check if VideoUI is properly initialized
setTimeout(() => {
  if (window.videoApp) {
    console.log('\n✅ VideoApp is initialized');
    console.log('VideoApp UI:', window.videoApp.ui);
    console.log('VideoApp Player:', window.videoApp.player);
    
    if (window.videoApp.ui) {
      console.log('UI Elements:', window.videoApp.ui.elements);
      console.log('UI State:', window.videoApp.ui.state);
    }
  } else {
    console.error('\n❌ VideoApp is not initialized');
  }
  
  // Check for any errors in console
  console.log('\n===== End Debug =====');
}, 1000);
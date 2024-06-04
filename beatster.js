import QrScanner from "https://unpkg.com/qr-scanner/qr-scanner.min.js";

let player; // Define player globally
let playbackTimer; // hold the timer reference
let playbackDuration = 30; // Default playback duration
let qrScanner;
let csvCache = {};
let showSettings = false;

window.addEventListener('resize', function(event) {
    adjustView();
}, true);


document.addEventListener('DOMContentLoaded', function () {
    let lastDecodedText = ""; // Store the last decoded text

    const video = document.getElementById('qr-video');
    const resultContainer = document.getElementById("qr-reader-results");


    // Get the camera select element
    const cameraSelect = document.getElementById('camera-select');

    // Function to handle device selection
    async function handleDeviceSelection() {
        try {

            // Get the list of available media devices
            const devices = await navigator.mediaDevices.enumerateDevices();

            // Find the video input devices
            const videoInputDevices = devices.filter(device => device.kind === 'videoinput');
            
            // Populate the camera select options
            videoInputDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Camera ${cameraSelect.length + 1}`;
                cameraSelect.appendChild(option);
            });

            // Add event listener to change the selected camera
            cameraSelect.addEventListener('change', async () => {
                qrScanner.stop();
                const selectedDeviceId = cameraSelect.value;
                const constraints = { 
                    video: { 
                        deviceId: selectedDeviceId
                    }
                };
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                video.srcObject = stream;
                console.log(video.videoWidth);
                startQrScanner();
            });

            // Select the first camera by default
            if (videoInputDevices.length > 0) {
                const defaultDeviceId = videoInputDevices[0].deviceId;
                cameraSelect.value = defaultDeviceId;
                const constraints = { 
                    video: { 
                        deviceId: selectedDeviceId
                    }
                };
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                video.srcObject = stream;
                console.log(video.videoWidth);
            } else {
                console.log('No video input devices found');
            }
        } catch (error) {
            console.error('Error accessing media devices:', error);
        }
    }


    // Call the function to handle device selection
    handleDeviceSelection();

    console.log(video.videoWidth);
    qrScanner = new QrScanner(video, result => {
        console.log('decoded qr code:', result);
        if (result.data !== lastDecodedText) {
            lastDecodedText = result.data; // Update the last decoded text
            handleScannedLink(result.data);
            document.getElementById('startstop-video').style.visibility = 'visible'; // Show the Play/Stop button
        }
    }, { 
        highlightScanRegion: true,
        highlightCodeOutline: true,
        calculateScanRegion: () =>{
            const size = 250;
            const x = document.getElementById("qr-video").videoWidth / 2 - size / 2;
            const y = document.getElementById("qr-video").videoHeight / 2 - size / 2;
            return { x, y, width: size, height: size };
        }
    }
    );
    
    // Function to determine the type of link and act accordingly
    async function handleScannedLink(decodedText) {
        let youtubeURL = "";
        if (isYoutubeLink(decodedText)) {
            youtubeURL = decodedText;
        } else if (isHitsterLink(decodedText)) {
            const hitsterData = parseHitsterUrl(decodedText);
            if (hitsterData) {
                console.log("Hitster data:", hitsterData.id, hitsterData.lang);
                try {
                    const csvContent = await getCachedCsv(`/hitster-${hitsterData.lang}.csv`);
                    const youtubeLink = lookupYoutubeLink(hitsterData.id, csvContent);
                    if (youtubeLink) {
                        // Handle YouTube link obtained from the CSV
                        console.log(`YouTube Link from CSV: ${youtubeLink}`);
                        youtubeURL = youtubeLink;
                        // Example: player.cueVideoById(parseYoutubeLink(youtubeLink).videoId);
                    }
                } catch (error) {
                  console.error("Failed to fetch CSV:", error);
                }
            }
            else {
                console.log("Invalid Hitster URL:", decodedText);
            }
        }

        console.log(`YouTube Video URL: ${youtubeURL}`);

        const youtubeLinkData = parseYoutubeLink(youtubeURL);
        if (youtubeLinkData) {
            qrScanner.stop(); // Stop scanning after a result is found

            lastDecodedText = ""; // Reset the last decoded text

            document.getElementById('video-id').textContent = youtubeLinkData.videoId;  

            console.log(youtubeLinkData.videoId);
            console.log("playing video");
            player.cueVideoById(youtubeLinkData.videoId, youtubeLinkData.startTime || 0);   
            
        }
        
    }

    function isHitsterLink(url) {
        // Regular expression to match with or without "http://" or "https://"
        const regex = /^(?:http:\/\/|https:\/\/)?www\.hitstergame\.com\/.+/;
        return regex.test(url);
    }

    // Example implementation for isYoutubeLink
    function isYoutubeLink(url) {
        return url.startsWith("https://www.youtube.com") || url.startsWith("https://youtu.be") || url.startsWith("https://music.youtube.com/");
    }

    // Example implementation for parseHitsterUrl
    function parseHitsterUrl(url) {
        const regex = /^(?:http:\/\/|https:\/\/)?www\.hitstergame\.com\/(.+?)\/(\d+)$/;
        const match = url.match(regex);
        if (match) {
            // Hitster URL is in the format: https://www.hitstergame.com/{lang}/{id}
            // lang can be things like "en", "de", "pt", etc., but also "de/aaaa0007"
            const processedLang = match[1].replace(/\//g, "-");
            return { lang: processedLang, id: match[2] };
        }
        return null;
    }

    // Looks up the YouTube link in the CSV content based on the ID
    function lookupYoutubeLink(id, csvContent) {
        const headers = csvContent[0]; // Get the headers from the CSV content
        const cardIndex = headers.indexOf('Card#');
        const urlIndex = headers.indexOf('URL');

        const targetId = parseInt(id, 10); // Convert the incoming ID to an integer
        const lines = csvContent.slice(1); // Exclude the first row (headers) from the lines

        if (cardIndex === -1 || urlIndex === -1) {
            throw new Error('Card# or URL column not found');
        }

        for (let row of lines) {
            const csvId = parseInt(row[cardIndex], 10);
            if (csvId === targetId) {
                return row[urlIndex].trim(); // Return the YouTube link
            }
        }
        return null; // If no matching ID is found

    }

    // Could also use external library, but for simplicity, we'll define it here
    function parseCSV(text) {
        const lines = text.split('\n');
        return lines.map(line => {
            const result = [];
            let startValueIdx = 0;
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                if (line[i] === '"' && line[i-1] !== '\\') {
                    inQuotes = !inQuotes;
                } else if (line[i] === ',' && !inQuotes) {
                    result.push(line.substring(startValueIdx, i).trim().replace(/^"(.*)"$/, '$1'));
                    startValueIdx = i + 1;
                }
            }
            result.push(line.substring(startValueIdx).trim().replace(/^"(.*)"$/, '$1')); // Push the last value
            return result;
        });
    }

    async function getCachedCsv(url) {
        if (!csvCache[url]) { // Check if the URL is not in the cache
            console.log(`URL not cached, fetching CSV from URL: ${url}`);
            const response = await fetch(url);
            const data = await response.text();
            csvCache[url] = parseCSV(data); // Cache the parsed CSV data using the URL as a key
        }
        return csvCache[url]; // Return the cached data for the URL
    }

    function parseYoutubeLink(url) {
        // First, ensure that the URL is decoded (handles encoded URLs)
        url = decodeURIComponent(url);
    
        const regex = /^https?:\/\/(www\.youtube\.com\/watch\?v=|youtu\.be\/|music\.youtube\.com\/watch\?v=)(.{11}).*/;
        const match = url.match(regex);
        if (match) {
            const queryParams = new URLSearchParams(match[4]); // Correctly capture and parse the query string part of the URL
            const videoId = match[2];
            let startTime = queryParams.get('start') || queryParams.get('t');
            const endTime = queryParams.get('end');
    
            // Normalize and parse 't' and 'start' parameters
            startTime = normalizeTimeParameter(startTime);
            const parsedEndTime = normalizeTimeParameter(endTime);
    
            return { videoId, startTime, endTime: parsedEndTime };
        }
        return null;
    }
    
    function normalizeTimeParameter(timeValue) {
        if (!timeValue) return null; // Return null if timeValue is falsy
    
        // Handle time formats (e.g., 't=1m15s' or '75s')
        let seconds = 0;
        if (timeValue.endsWith('s')) {
            seconds = parseInt(timeValue, 10);
        } else {
            // Additional parsing can be added here for 'm', 'h' formats if needed
            seconds = parseInt(timeValue, 10);
        }
    
        return isNaN(seconds) ? null : seconds;
    }

    startQrScanner();

    
    
});

document.getElementById('settingsButton').addEventListener('click', function() {
    console.log("settings button clicked");
    showSettings = !showSettings;
    if (showSettings == true) {
        document.getElementById('settings_div').style.visibility = 'visible';
    }
    else {
        document.getElementById('settings_div').style.visibility = 'hidden';
    }
});

document.getElementById('startstop-video').addEventListener('click', function () {
    if(this.state === 'play') {
        this.state = 'pause';
        document.getElementById('img-pp').src = 'icons/pause.png';
        player.pauseVideo();
    } else {
        this.state = 'play';
        document.getElementById('img-pp').src = 'icons/play.png';
        if (document.getElementById('randomplayback').checked == true) {
            playVideoAtRandomStartTime();
        }
        else {
            player.playVideo();
        }
    }
});

document.getElementById('cancelScanButton').addEventListener('click', function () {
    qrScanner.stop();
});

document.getElementById('startScanButton').addEventListener('click', function () {
    qrScanner.stop();
    startQrScanner();
});

function startQrScanner() {
    //start the qr scanner
    qrScanner.start().catch(err => {
        console.error('Unable to start QR Scanner', err);
        qrResult.textContent = "QR Scanner failed to start.";
    });
    qrScanner.start().then(() => {
        qrScanner.setInversionMode('both'); // we want to scan also for Hitster QR codes which use inverted colors
    });
    document.getElementById('startstop-video').style.visibility = 'hidden';
}

function adjustView() {
    let vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0)
    let vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0)
    let videoWidth = document.getElementById("qr-video").videoWidth;
    let videoHeight = document.getElementById("qr-video").videoHeight;
    let vRatio = vw / vh;
    let videoRatio = videoWidth / videoHeight;
    //console.log("ratio view: " + vRatio + " ratio video: " + videoRatio);
    if (vRatio > videoRatio) {
        //console.log("video is too narrow");
        document.querySelector(':root').style.setProperty('--videoWidth' , '100vw');
        document.querySelector(':root').style.setProperty('--videoHeight' , 'auto');
        var transalteY = (vw / videoRatio - vh) / 2;
        document.querySelector(':root').style.setProperty('--translationY' , -transalteY + 'px');
        document.querySelector(':root').style.setProperty('--translationX' , '0px');
    }
    else {
        //console.log("video is too wide");
        document.querySelector(':root').style.setProperty('--videoWidth' , 'auto');
        document.querySelector(':root').style.setProperty('--videoHeight' , '100vh');
        var transalteX = (vh * videoRatio - vw) / 2;
        document.querySelector(':root').style.setProperty('--translationX' , -transalteX + 'px');
        document.querySelector(':root').style.setProperty('--translationY' , '0px');
    }
}

/* Youtube player */
// This function creates an <iframe> (and YouTube player) after the API code downloads.
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '0',
        width: '0',
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

// Load the YouTube IFrame API script
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

// The API will call this function when the video player is ready.
function onPlayerReady(event) {
    // Cue a video using the videoId from the QR code (example videoId used here)
    // player.cueVideoById('dQw4w9WgXcQ');
}

// Display video information when it's cued
function onPlayerStateChange(event) {
    if (event.data == YT.PlayerState.CUED) {
        document.getElementById('startstop-video').style.display = 'inline-block';
        document.getElementById('startstop-video').style.background = "green";
        // Display title and duration
        var videoData = player.getVideoData();
        document.getElementById('video-title').textContent = videoData.title;
        var duration = player.getDuration();
        document.getElementById('video-duration').textContent = formatDuration(duration);
        // Check for Autoplay
        if (document.getElementById('autoplay').checked == true) {
            document.getElementById('startstop-video').innerHTML = "Stop";
            if (document.getElementById('randomplayback').checked == true) {
                playVideoAtRandomStartTime();
            }
            else {
            player.playVideo();
            }
        }
    }
    else if (event.data == YT.PlayerState.PLAYING) {
        document.getElementById('startstop-video').style.background = "red";
    }
    else if (event.data == YT.PlayerState.PAUSED | event.data == YT.PlayerState.ENDED) {
        document.getElementById('startstop-video').style.background = "green";
    }
    else if (event.data == YT.PlayerState.BUFFERING) {
        document.getElementById('startstop-video').style.background = "orange";
    }
}

// Helper function to format duration from seconds to a more readable format
function formatDuration(duration) {
    var minutes = Math.floor(duration / 60);
    var seconds = duration % 60;
    return minutes + ":" + (seconds < 10 ? '0' : '') + seconds;
}

function playVideoAtRandomStartTime() {
    const minStartPercentage = 0.10;
    const maxEndPercentage = 0.90;
    let videoDuration = player.getDuration()
    let startTime = player.getCurrentTime(); // If the video is already cued to a specific start time
    playbackDuration = parseInt(document.getElementById('playback-duration').value, 10) || 30;
    let endTime = startTime + playbackDuration;

    // Adjust start and end time based on video duration
    const minStartTime = Math.max(startTime, videoDuration * minStartPercentage);
    const maxEndTime = videoDuration * maxEndPercentage;

    // Ensure the video ends by 90% of its total duration
    if (endTime > maxEndTime) {
        endTime = maxEndTime;
        startTime = Math.max(minStartTime, endTime - playbackDuration);
    }

    // If custom start time is 0 or very close to the beginning, pick a random start time within the range
    if (startTime <= minStartTime) {
        const range = maxEndTime - minStartTime - playbackDuration;
        const randomOffset = Math.random() * range;
        startTime = minStartTime + randomOffset;
        endTime = startTime + playbackDuration;
    }

    // Cue video at calculated start time and play
    console.log("play random", startTime, endTime)
    player.seekTo(startTime, true);
    player.playVideo();

    clearTimeout(playbackTimer); // Clear any existing timer
    // Schedule video stop after the specified duration
    playbackTimer = setTimeout(() => {
        player.pauseVideo();
        document.getElementById('startstop-video').innerHTML = "Play";
    }, (endTime - startTime) * 1000); // Convert to milliseconds
}


/* Settings and cookies*/
document.getElementById('randomplayback').addEventListener('click', function() {
    document.cookie = "RandomPlaybackChecked=" + this.checked + ";max-age=2592000"; //30 Tage
    listCookies();
});

document.getElementById('autoplay').addEventListener('click', function() {
    document.cookie = "autoplayChecked=" + this.checked + ";max-age=2592000"; //30 Tage
    listCookies();
});

document.getElementById('cookies').addEventListener('click', function() {
    var cb = document.getElementById('cookies');
    if (cb.checked == true) {
        document.getElementById('cookielist').style.display = 'block';
    }
    else {
        document.getElementById('cookielist').style.display = 'none';
    }
});

function listCookies() {
    var result = document.cookie;
    document.getElementById("cookielist").innerHTML=result;
 }

function getCookieValue(name) {
    const regex = new RegExp(`(^| )${name}=([^;]+)`);
    const match = document.cookie.match(regex);
    if (match) {
        return match[2];
    }
}

function getCookies() {
    var isTrueSet;
    if (getCookieValue("RandomPlaybackChecked") != "") {
        isTrueSet = (getCookieValue("RandomPlaybackChecked") === 'true');
        document.getElementById('randomplayback').checked = isTrueSet;
    }
    if (getCookieValue("autoplayChecked") != "") {
        isTrueSet = (getCookieValue("autoplayChecked") === 'true');
        document.getElementById('autoplay').checked = isTrueSet;  
    }
    listCookies();
}

window.addEventListener("DOMContentLoaded", getCookies());
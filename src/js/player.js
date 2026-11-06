import { state, preloadedImages, elements } from './state.js';
import { BASE_IMAGE_URL, partsMap } from './config.js';
import { fetchRegionRadarList, getNmcUrl, findLatestValidNmcTime, format_datetime2, updateTime } from './utils.js';
import { updateBoxCanvas } from './tracking.js';
import { renderDiffCanvas } from './diff.js';
import { showSpinner, hideSpinner, preloadAllFrames } from './preload.js';

export function applyTransform() {
	const transformStr = `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`;
	if (elements.overlayImage) elements.overlayImage.style.transform = transformStr;
	if (elements.boxCanvasLeft) elements.boxCanvasLeft.style.transform = transformStr;
	if (elements.boxCanvasRight) elements.boxCanvasRight.style.transform = transformStr;
	if (elements.diffCanvas) elements.diffCanvas.style.transform = transformStr;
}

export function resetTransform() {
	state.scale = 1; 
	state.translateX = 0; 
	state.translateY = 0;
	applyTransform();
}

export function adjustZoom(factor, clickX, clickY) {
	pause();
	const pane = elements.paneLeft || elements.imageViewport;
	const rect = pane ? pane.getBoundingClientRect() : (elements.imageViewport ? elements.imageViewport.getBoundingClientRect() : { width: 600, height: 400 });
	const x = clickX !== undefined ? clickX : rect.width / 2;
	const y = clickY !== undefined ? clickY : rect.height / 2;

	const newScale = Math.max(0.5, Math.min(state.scale * factor, 20));
	state.translateX = x - (x - state.translateX) * (newScale / state.scale);
	state.translateY = y - (y - state.translateY) * (newScale / state.scale);
	state.scale = newScale;
	applyTransform();
}

export function syncTransformForLayoutChange(oldWidth, oldHeight, newWidth, newHeight) {
	if (!oldWidth || !oldHeight || !newWidth || !newHeight) return;
	const img = elements.overlayImage;
	if (!img) return;

	const naturalWidth = img.naturalWidth || 600;
	const naturalHeight = img.naturalHeight || 400;
	const aspect = naturalWidth / naturalHeight;

	// Calculate target point in normalized coordinates relative to old pane center
	const cx_old = oldWidth / 2;
	const cy_old = oldHeight / 2;
	const x_center_old = (cx_old - state.translateX) / state.scale;
	const y_center_old = (cy_old - state.translateY) / state.scale;

	let w_r_old, h_r_old, x_0_old, y_0_old;
	if (oldWidth / oldHeight > aspect) {
		w_r_old = oldHeight * aspect;
		h_r_old = oldHeight;
		x_0_old = (oldWidth - w_r_old) / 2;
		y_0_old = 0;
	} else {
		w_r_old = oldWidth;
		h_r_old = oldWidth / aspect;
		x_0_old = 0;
		y_0_old = (oldHeight - h_r_old) / 2;
	}

	const u = (x_center_old - x_0_old) / w_r_old;
	const v = (y_center_old - y_0_old) / h_r_old;

	// Calculate image bounds in new pane
	let w_r_new, h_r_new, x_0_new, y_0_new;
	if (newWidth / newHeight > aspect) {
		w_r_new = newHeight * aspect;
		h_r_new = newHeight;
		x_0_new = (newWidth - w_r_new) / 2;
		y_0_new = 0;
	} else {
		w_r_new = newWidth;
		h_r_new = newWidth / aspect;
		x_0_new = 0;
		y_0_new = (newHeight - h_r_new) / 2;
	}

	// Maintain visual scale relative to image size
	const r = w_r_new / w_r_old;
	const newScale = Math.max(0.5, Math.min(state.scale / r, 20));

	// Calculate new translate values to keep the same target point at the center of new pane
	const x_center_new = x_0_new + u * w_r_new;
	const y_center_new = y_0_new + v * h_r_new;
	const cx_new = newWidth / 2;
	const cy_new = newHeight / 2;

	state.scale = newScale;
	state.translateX = cx_new - x_center_new * newScale;
	state.translateY = cy_new - y_center_new * newScale;

	applyTransform();
}


export function getTimelineFrames() {
	if (!state.radarFrames || state.radarFrames.length === 0) return [];
	const count = (state.loopHours || 1) * 10;
	if (state.radarFrames.length > count) {
		return state.radarFrames.slice(state.radarFrames.length - count);
	}
	return state.radarFrames;
}

export function getActualIndex(timelineIndex) {
	if (!state.radarFrames || state.radarFrames.length === 0) return 0;
	const count = (state.loopHours || 1) * 10;
	const offset = Math.max(0, state.radarFrames.length - count);
	return offset + timelineIndex;
}

export function buildTimeline() {
	if (!elements.timelineTicks) return;
	elements.timelineTicks.innerHTML = '';
	const frames = getTimelineFrames();
	frames.forEach((frame, index) => {
		const tick = document.createElement('div');
		tick.className = 'timeline-tick' + (index === state.imageIndex ? ' active' : '');
		tick.title = frame.dt || '';
		tick.addEventListener('click', (e) => {
			e.stopPropagation();
			pause();
			state.imageIndex = index;
			updateImage(state.imageIndex);
		});
		elements.timelineTicks.appendChild(tick);
	});
}

export function updateTimelineState() {
	if (!elements.timelineTicks) return;
	const ticks = elements.timelineTicks.querySelectorAll('.timeline-tick');
	const frames = getTimelineFrames();
	ticks.forEach((tick, idx) => {
		if (idx === state.imageIndex) {
			tick.classList.add('active');
		} else {
			tick.classList.remove('active');
		}
	});
	if (elements.timelineProgressBar && frames.length > 1) {
		const progressPercent = (state.imageIndex / (frames.length - 1)) * 100;
		elements.timelineProgressBar.style.width = `${progressPercent}%`;
	}
}

export function getPrevFrame(timelineIndex) {
	if (!state.radarFrames || state.radarFrames.length === 0) return null;
	const actualIdx = getActualIndex(timelineIndex);
	const prevActualIdx = actualIdx - state.diffStep;
	if (prevActualIdx >= 0 && prevActualIdx < state.radarFrames.length) {
		return state.radarFrames[prevActualIdx];
	}
	return state.radarFrames[0];
}

export function updateImage(timelineIndex) {
	const frames = getTimelineFrames();
	if (!frames || frames.length === 0) return;
	if (!state.isPreloaded) {
		showSpinner();
	}

	const currentFrame = frames[timelineIndex] || frames[0];
	const currUrl = currentFrame.url;
	const currImg = preloadedImages[currUrl];

	const targetSrc = (currImg && currImg.src && !currImg.isFailed) ? currImg.src : currUrl;
	if (elements.overlayImage.src !== targetSrc) {
		elements.overlayImage.src = targetSrc;
	}

	if (elements.overlayDatetimeLeft) {
		const regionLabel = partsMap[state.currentPartClass] ? partsMap[state.currentPartClass].name : '';
		const formattedCurrTime = currentFrame.dt || '';
		if (currImg && currImg.isInterpolated) {
			elements.overlayDatetimeLeft.textContent = `${regionLabel} ${formattedCurrTime} (插值补全)`;
		} else {
			elements.overlayDatetimeLeft.textContent = `${regionLabel} ${formattedCurrTime}`;
		}
		if (formattedCurrTime && !state.isPlaying) {
			state.radarTime = formattedCurrTime;
			updateTime();
		}
	}

	const activeCurrImg = (currImg && currImg.complete && !currImg.isFailed) ? currImg : (elements.overlayImage.complete ? elements.overlayImage : null);
	if (activeCurrImg) {
		updateBoxCanvas(activeCurrImg, currUrl);
	}

	if (state.viewMode === 'split' || state.viewMode === 'diff') {
		const prevFrame = getPrevFrame(timelineIndex);
		if (prevFrame) {
			const prevUrl = prevFrame.url;
			const prevImg = preloadedImages[prevUrl];
			const formattedPrevTime = prevFrame.dt || '';

			if (elements.overlayDatetimeRight) {
				let label = `Δt (对: ${formattedPrevTime})`;
				if (prevImg && prevImg.isInterpolated) label += " [插值]";
				elements.overlayDatetimeRight.textContent = label;
			}

			if (activeCurrImg && prevImg && prevImg.complete && !prevImg.isFailed) {
				renderDiffCanvas(activeCurrImg, prevImg, currUrl, prevUrl, elements.diffCanvas);
			}
		}
	}

	updateTimelineState();
}

export function showFrameAndReset(index) {
	updateImage(index);
	resetTransform();
}

export function advanceFrame() {
	const frames = getTimelineFrames();
	if (!frames || frames.length === 0) return;
	state.imageIndex = (state.imageIndex + 1) % frames.length;
	updateImage(state.imageIndex);
	scheduleNextFrame();
}

export function scheduleNextFrame() {
	const frames = getTimelineFrames();
	if (!state.isPlaying || !frames || frames.length === 0) return;
	const isLastFrame = state.imageIndex === frames.length - 1;
	const delay = isLastFrame ? 2000 : 400;
	state.animationTimeout = setTimeout(advanceFrame, delay);
}

export function updatePulseAnimationState() {
	const active = !state.isPlaying;
	[elements.boxCanvasLeft, elements.boxCanvasRight].forEach(canvas => {
		if (canvas) {
			if (active) {
				canvas.classList.add('pulse-active');
			} else {
				canvas.classList.remove('pulse-active');
			}
		}
	});
}

export function play() {
	state.isPlaying = true;
	if (elements.playPauseBtn) elements.playPauseBtn.innerHTML = '❚❚';
	if (state.isPreloaded) {
		scheduleNextFrame();
	} else {
		preloadAllFrames().then(() => {
			if (state.isPlaying) {
				scheduleNextFrame();
			}
		});
	}
	updatePulseAnimationState();
}

export function pause(syncTime = true) {
	state.isPlaying = false;
	if (elements.playPauseBtn) elements.playPauseBtn.innerHTML = '▶';
	clearTimeout(state.animationTimeout);
	updatePulseAnimationState();
	if (syncTime) {
		const frames = getTimelineFrames();
		const frame = frames[state.imageIndex];
		if (frame && frame.dt) {
			state.radarTime = frame.dt;
			updateTime();
		}
	}
}

export async function setupAnimation(regionClass, resetView = false, targetTime = null) {
	const setupId = ++state.currentPreloadId;
	clearTimeout(state.animationTimeout);
	state.preloadPromise = null;
	state.isPreloaded = false;
	showSpinner();

	const info = partsMap[regionClass || state.currentPartClass];
	const partCode = info ? info.code : 'ANCN';
	const radarCode = info ? info.radarCode : 'HB';

	let currentFrameDt = null;
	if (!resetView && state.radarFrames && state.radarFrames.length > 0) {
		const oldFrames = getTimelineFrames();
		const currentFrame = oldFrames[state.imageIndex];
		if (currentFrame) {
			currentFrameDt = currentFrame.dt;
		}
	}

	const totalNeeded = (state.loopHours || 1) * 10 + 5;

	if (state.serviceSource === 'nmc') {
		const validTime = targetTime || await findLatestValidNmcTime();
		if (setupId !== state.currentPreloadId) return;

		state.radarFrames = [];
		// Load historical frames based on selected loop hours plus 5 frames comparison buffer
		for (let i = totalNeeded - 1; i >= 0; i--) {
			const frameTime = new Date(validTime.getTime());
			frameTime.setMinutes(validTime.getMinutes() - (i * 6));
			const formattedDt = format_datetime2(frameTime);
			state.radarFrames.push({
				fn1: '',
				dt: formattedDt,
				url: getNmcUrl(partCode, frameTime)
			});
		}
	} else {
		try {
			const list = await fetchRegionRadarList(radarCode);
			if (setupId !== state.currentPreloadId) return;

			if (list && list.length > 0) {
				let endIndex = list.length;
				if (targetTime) {
					const targetStr = format_datetime2(targetTime);
					let idx = list.findIndex(f => f.dt && f.dt > targetStr);
					if (idx === -1) {
						endIndex = list.length;
					} else if (idx > 0) {
						endIndex = idx;
					} else {
						endIndex = 1;
					}
				}
				// Load historical frames based on selected loop hours plus 5 frames comparison buffer
				state.radarFrames = list.slice(Math.max(0, endIndex - totalNeeded), endIndex).map(item => ({
					fn1: item.fn1,
					dt: item.dt,
					url: `${BASE_IMAGE_URL}/${item.fn1}`
				}));
			} else {
				state.radarFrames = [];
			}
		} catch (e) {
			if (setupId !== state.currentPreloadId) return;
			console.error("Error loading radar frames for", radarCode, e);
			state.radarFrames = [];
		}
	}

	if (setupId !== state.currentPreloadId) return;

	const frames = getTimelineFrames();
	let newIndex = -1;
	if (currentFrameDt) {
		newIndex = frames.findIndex(f => f.dt === currentFrameDt);
	}
	if (newIndex !== -1) {
		state.imageIndex = newIndex;
	} else {
		state.imageIndex = Math.max(0, frames.length - 1);
	}

	buildTimeline();

	if (resetView) {
		showFrameAndReset(state.imageIndex);
	} else {
		updateImage(state.imageIndex);
	}

	if (state.isPlaying) {
		play();
	} else {
		preloadAllFrames();
		updatePulseAnimationState();
	}
}

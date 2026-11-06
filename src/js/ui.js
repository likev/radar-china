import { state, elements, initElements } from './state.js';
import { partsMap, SVG_FALLBACK_URL } from './config.js';
import { updateOverviewMap, updateTime, updateLiveIndicator, adjustMapScale, parse_datetime } from './utils.js';
import { showFrameAndReset, adjustZoom, resetTransform, setupAnimation, pause, play, updateImage, getTimelineFrames, syncTransformForLayoutChange } from './player.js';
import { hideSpinner, exportLoopToGif } from './preload.js';
import { bindViewportGestures } from './gestures.js';

export function closeOverlay() {
	pause();
	if (state.activePanMoveHandler) window.removeEventListener('mousemove', state.activePanMoveHandler);
	if (state.activePanEndHandler) window.removeEventListener('mouseup', state.activePanEndHandler);

	const viewport = window.visualViewport || window;
	if (state.activeResizeHandler) viewport.removeEventListener('resize', state.activeResizeHandler);

	state.activePanMoveHandler = null;
	state.activePanEndHandler = null;
	state.activeResizeHandler = null;
	state.activeOverlayUpdater = null;
	toggleRegionPicker(false);
	if (elements.overlay) elements.overlay.classList.remove('visible');
	if (elements.overlayMask) elements.overlayMask.classList.remove('visible');
	document.body.style.overflow = '';
	updateTime();
	if (state.autoUpdate && !state.isManualTime) {
		updateOverviewMap();
		updateLiveIndicator();
	}
}

export function toggleRegionPicker(show) {
	const picker = document.getElementById('region-picker');
	if (!picker) return;
	if (show === undefined) {
		picker.classList.toggle('visible');
	} else if (show) {
		picker.classList.add('visible');
	} else {
		picker.classList.remove('visible');
	}
	if (picker.classList.contains('visible')) {
		picker.querySelectorAll('.region-pick-btn').forEach(b => {
			if (b.getAttribute('data-part') === state.currentPartClass) {
				b.classList.add('active');
			} else {
				b.classList.remove('active');
			}
		});
	}
}

export function updateAutoUpdateUI() {
	const isAuto = state.autoUpdate;

	const radarInput = document.getElementById('radartime');
	if (radarInput) {
		radarInput.disabled = isAuto;
		radarInput.readOnly = isAuto;
	}

	const viewRadarBtn = document.getElementById('view-radar');
	const viewNowBtn = document.getElementById('view-now');
	const viewBackBtn = document.getElementById('view-back');
	const viewForwardBtn = document.getElementById('view-forward');

	if (viewRadarBtn) viewRadarBtn.style.display = isAuto ? 'none' : '';
	if (viewNowBtn) viewNowBtn.style.display = isAuto ? 'none' : '';
	if (viewBackBtn) viewBackBtn.style.display = isAuto ? 'none' : '';
	if (viewForwardBtn) viewForwardBtn.style.display = isAuto ? 'none' : '';
}

export function updateOverlayLayout() {
	if (!elements.overlay) return;
	const vp = window.visualViewport || { 
		width: window.innerWidth, 
		height: window.innerHeight,
		offsetLeft: 0,
		offsetTop: 0
	};
	const isMobile = vp.width < 768;
	const aspectRatio = vp.width / vp.height;

	if (aspectRatio < 1) {
		elements.overlay.classList.add('portrait-aspect');
	} else {
		elements.overlay.classList.remove('portrait-aspect');
	}

	if (isMobile) {
		elements.overlay.style.width = `${vp.width}px`;
		elements.overlay.style.height = `${vp.height}px`;
		elements.overlay.style.top = `${vp.offsetTop}px`;
		elements.overlay.style.left = `${vp.offsetLeft}px`;
		elements.overlay.style.borderRadius = '0';
		elements.overlay.style.transform = 'none';
	} else {
		elements.overlay.style.width = '';
		elements.overlay.style.height = '';
		elements.overlay.style.top = '';
		elements.overlay.style.left = '';
		elements.overlay.style.borderRadius = '';
		elements.overlay.style.transform = '';
	}
}

export function openOverlayForRegion(partClass, resetView = true) {
	if (!partsMap[partClass]) return;
	state.currentPartClass = partClass;
	state.currentPartName = partsMap[partClass].code;
	// Preserve manual time when switching regions
	state.activeOverlayUpdater = () => {
		const t = (state.isManualTime && state.radarTime) ? parse_datetime(state.radarTime) : null;
		setupAnimation(partClass, false, t);
	};

	if (elements.overlay) {
		elements.overlay.querySelectorAll('.overlay-region-btn').forEach(b => {
			if (b.getAttribute('data-part') === partClass) b.classList.add('active');
			else b.classList.remove('active');
		});
	}
	document.querySelectorAll('.region-btn').forEach(b => {
		if (b.getAttribute('data-part') === partClass) b.classList.add('active');
		else b.classList.remove('active');
	});

	updateOverlayLayout();
	state.activeResizeHandler = updateOverlayLayout;
	const viewport = window.visualViewport || window;
	viewport.addEventListener('resize', state.activeResizeHandler);

	if (elements.overlay) elements.overlay.classList.add('visible');
	if (elements.overlayMask) elements.overlayMask.classList.add('visible');
	document.body.style.overflow = 'hidden';
	updateAutoUpdateUI();

	// Pass targetTime when in manual mode so the new region loads the same historical time
	const targetTime = (state.isManualTime && state.radarTime) ? parse_datetime(state.radarTime) : null;
	setupAnimation(partClass, resetView, targetTime);
}


export async function init() {
	if (!initElements()) return;
	adjustMapScale();

	elements.overlayImage.onload = () => {
		hideSpinner();
		if (state.isPreloaded && state.radarFrames && state.radarFrames[state.imageIndex]) {
			updateImage(state.imageIndex);
		}
	};
	elements.overlayImage.onerror = function() {
		hideSpinner();
		if (this.src && this.src.startsWith('data:image/svg+xml')) return;
		this.src = SVG_FALLBACK_URL;
	};

	// Bind source toggle immediately on init
	const sourceToggle = document.getElementById('source-toggle');
	if (sourceToggle) {
		const buttons = sourceToggle.querySelectorAll('.toggle-option');
		buttons.forEach(btn => {
			if (btn.getAttribute('data-value') === state.serviceSource) {
				btn.classList.add('active');
			} else {
				btn.classList.remove('active');
			}
			btn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const val = btn.getAttribute('data-value');
				if (state.serviceSource === val) return;

				state.serviceSource = val;
				buttons.forEach(b => {
					if (b.getAttribute('data-value') === val) b.classList.add('active');
					else b.classList.remove('active');
				});

				const targetTime = (state.isManualTime && state.radarTime) ? parse_datetime(state.radarTime) : null;
				const isOverlayVisible = elements.overlay && elements.overlay.classList.contains('visible');
				if (isOverlayVisible) {
					await updateOverviewMap(targetTime, state.currentPartClass);
					setupAnimation(state.currentPartClass, false, targetTime);
				} else {
					await updateOverviewMap(targetTime);
				}
			});
		});
	}

	const navigateTime = async (targetTime, btn) => {
		if (btn) btn.classList.add('loading');
		// Bug 1 fix: track whether user is in manual time mode
		state.isManualTime = (targetTime !== null);
		try {
			await updateOverviewMap(targetTime);
			if (elements.overlay && elements.overlay.classList.contains('visible')) {
				setupAnimation(state.currentPartClass, false, targetTime);
			}
		} catch (err) {
			console.error("Error retrieving data for time:", err);
		} finally {
			if (btn) btn.classList.remove('loading');
		}
	};

	const viewNowBtn = document.getElementById('view-now');
	if (viewNowBtn) {
		// Clicking 'Latest' clears manual mode
		viewNowBtn.addEventListener('click', () => navigateTime(null, viewNowBtn));
	}

	const viewRadarBtn = document.getElementById('view-radar');
	if (viewRadarBtn) {
		viewRadarBtn.addEventListener('click', () => {
			const input = document.getElementById('radartime');
			if (input && input.value) {
				const time = parse_datetime(input.value);
				if (!isNaN(time.getTime())) {
					navigateTime(time, viewRadarBtn);
				}
			}
		});
	}

	const viewBackBtn = document.getElementById('view-back');
	if (viewBackBtn) {
		viewBackBtn.addEventListener('click', () => {
			if (state.radarTime) {
				const time = parse_datetime(state.radarTime);
				if (!isNaN(time.getTime())) {
					time.setMinutes(time.getMinutes() - 6);
					navigateTime(time, viewBackBtn);
				}
			}
		});
	}

	const viewForwardBtn = document.getElementById('view-forward');
	if (viewForwardBtn) {
		viewForwardBtn.addEventListener('click', () => {
			if (state.radarTime) {
				const time = parse_datetime(state.radarTime);
				if (!isNaN(time.getTime())) {
					time.setMinutes(time.getMinutes() + 6);
					// Bug 4 fix: cap at current time to avoid fetching future frames
					const now = new Date();
					if (time > now) time.setTime(now.getTime());
					navigateTime(time, viewForwardBtn);
				}
			}
		});
	}

	document.querySelectorAll('.radarPart, .radarPart img').forEach(target => {
		target.addEventListener('click', function(e) {
			e.stopPropagation();
			const parentPart = this.closest('.radarPart');
			if (parentPart) {
				const partClass = parentPart.classList[1];
				openOverlayForRegion(partClass, true);
			}
		});
	});

	document.querySelectorAll('.region-btn').forEach(btn => {
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			const partClass = btn.getAttribute('data-part');
			openOverlayForRegion(partClass, true);
		});
	});

	elements.overlay.querySelectorAll('.loop-period-btn').forEach(btn => {
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			elements.overlay.querySelectorAll('.loop-period-btn').forEach(b => b.classList.remove('active'));
			btn.classList.add('active');
			const hours = parseInt(btn.getAttribute('data-hours'), 10) || 1;
			state.loopHours = hours;
			const targetTime = (state.isManualTime && state.radarTime) ? parse_datetime(state.radarTime) : null;
			setupAnimation(state.currentPartClass, false, targetTime);
		});
	});

	elements.overlay.querySelectorAll('.mode-btn').forEach(btn => {
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			const oldMode = state.viewMode;
			const oldPane = (oldMode === 'diff') ? elements.paneRight : elements.paneLeft;
			const oldWidth = oldPane ? oldPane.clientWidth : 0;
			const oldHeight = oldPane ? oldPane.clientHeight : 0;

			elements.overlay.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
			btn.classList.add('active');
			state.viewMode = btn.getAttribute('data-mode');

			if (elements.overlay) {
				elements.overlay.classList.remove('split-mode', 'diff-mode', 'single-mode', 'mode-split', 'mode-diff', 'mode-single');
				elements.overlay.classList.add(`${state.viewMode}-mode`, `mode-${state.viewMode}`);
			}
			if (elements.viewportSplitWrap) {
				elements.viewportSplitWrap.classList.remove('mode-single', 'mode-split', 'mode-diff', 'split-mode', 'diff-mode');
				elements.viewportSplitWrap.classList.add(`mode-${state.viewMode}`, `${state.viewMode}-mode`);
			}
			if (elements.intervalGroup) {
				elements.intervalGroup.style.display = (state.viewMode === 'single') ? 'none' : 'flex';
			}

			const newPane = (state.viewMode === 'diff') ? elements.paneRight : elements.paneLeft;
			const newWidth = newPane ? newPane.clientWidth : 0;
			const newHeight = newPane ? newPane.clientHeight : 0;

			if (oldWidth && oldHeight && newWidth && newHeight) {
				syncTransformForLayoutChange(oldWidth, oldHeight, newWidth, newHeight);
			}

			updateImage(state.imageIndex);
		});
	});

	elements.overlay.querySelectorAll('.interval-btn').forEach(btn => {
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			elements.overlay.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('active'));
			btn.classList.add('active');
			state.diffStep = parseInt(btn.getAttribute('data-step'), 10) || 1;
			updateImage(state.imageIndex);
		});
	});

	if (elements.zoomInBtn) elements.zoomInBtn.onclick = (e) => { e.stopPropagation(); adjustZoom(1.3); };
	if (elements.zoomOutBtn) elements.zoomOutBtn.onclick = (e) => { e.stopPropagation(); adjustZoom(0.7); };
	if (elements.zoomResetBtn) elements.zoomResetBtn.onclick = (e) => { e.stopPropagation(); resetTransform(); };
	if (elements.prevBtn) elements.prevBtn.onclick = (e) => { e.stopPropagation(); pause(); const frames = getTimelineFrames(); const count = frames.length || 1; state.imageIndex = (state.imageIndex - 1 + count) % count; updateImage(state.imageIndex); };
	if (elements.nextBtn) elements.nextBtn.onclick = (e) => { e.stopPropagation(); pause(); const frames = getTimelineFrames(); const count = frames.length || 1; state.imageIndex = (state.imageIndex + 1) % count; updateImage(state.imageIndex); };
	if (elements.playPauseBtn) elements.playPauseBtn.onclick = (e) => { e.stopPropagation(); if (state.isPlaying) pause(); else play(); };
	if (elements.exportGifBtn) elements.exportGifBtn.onclick = (e) => { e.stopPropagation(); exportLoopToGif(); };

	bindViewportGestures();

	if (elements.closeBtn) elements.closeBtn.addEventListener('click', closeOverlay);
	if (elements.overlayMask) elements.overlayMask.addEventListener('click', closeOverlay);

	elements.overlay.querySelectorAll('.region-pick-btn').forEach(btn => {
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			const partClass = btn.getAttribute('data-part');
			toggleRegionPicker(false);
			openOverlayForRegion(partClass, true);
		});
	});

	window.addEventListener('resize', adjustMapScale);
	window.addEventListener('orientationchange', adjustMapScale);
	if (window.visualViewport) {
		window.visualViewport.addEventListener('resize', adjustMapScale);
	}
	window.addEventListener('keydown', (e) => {
		const isOverlayVisible = elements.overlay && elements.overlay.classList.contains('visible');
		if (!isOverlayVisible) return;

		const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
		if (tag === 'input' || tag === 'textarea' || tag === 'select' || (document.activeElement && document.activeElement.isContentEditable)) {
			return;
		}

		const picker = document.getElementById('region-picker');
		const isPickerOpen = picker && picker.classList.contains('visible');

		// '/' Key: Toggle region picker menu
		if (e.code === 'Slash' || e.key === '/' || e.keyCode === 191) {
			e.preventDefault();
			toggleRegionPicker();
			return;
		}

		// 'Escape' Key: Close region picker if open
		if (e.code === 'Escape' || e.key === 'Escape' || e.keyCode === 27) {
			if (isPickerOpen) {
				e.preventDefault();
				toggleRegionPicker(false);
				return;
			}
		}

		// Number Keys 1-7 when picker is open: select region
		if (isPickerOpen && ['1', '2', '3', '4', '5', '6', '7'].includes(e.key)) {
			e.preventDefault();
			const num = parseInt(e.key, 10);
			const partClass = `part${num}`;
			toggleRegionPicker(false);
			openOverlayForRegion(partClass, true);
			return;
		}

		if (e.code === 'Space' || e.key === ' ' || e.keyCode === 32) {
			e.preventDefault();
			if (state.isPlaying) {
				pause();
			} else {
				play();
			}
		} else if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft' || e.keyCode === 37) {
			e.preventDefault();
			pause();
			const frames = getTimelineFrames();
			const count = frames.length || 1;
			state.imageIndex = (state.imageIndex - 1 + count) % count;
			updateImage(state.imageIndex);
		} else if (e.code === 'ArrowRight' || e.key === 'ArrowRight' || e.keyCode === 39) {
			e.preventDefault();
			pause();
			const frames = getTimelineFrames();
			const count = frames.length || 1;
			state.imageIndex = (state.imageIndex + 1) % count;
			updateImage(state.imageIndex);
		} else if (['1', '2', '3', '4', '5'].includes(e.key)) {
			e.preventDefault();
			const hours = parseInt(e.key, 10);
			if (hours >= 1 && hours <= 5) {
				elements.overlay.querySelectorAll('.loop-period-btn').forEach(b => {
					if (parseInt(b.getAttribute('data-hours'), 10) === hours) {
						b.classList.add('active');
					} else {
						b.classList.remove('active');
					}
				});
				state.loopHours = hours;
				const targetTime = (state.isManualTime && state.radarTime) ? parse_datetime(state.radarTime) : null;
				setupAnimation(state.currentPartClass, false, targetTime);
			}
		}
	});
	setInterval(updateLiveIndicator, 60000);

	const autoUpdateCheck = document.getElementById('auto-update');
	if (autoUpdateCheck) {
		state.autoUpdate = autoUpdateCheck.checked;
		updateAutoUpdateUI();
		autoUpdateCheck.addEventListener('change', () => {
			state.autoUpdate = autoUpdateCheck.checked;
			if (state.autoUpdate) {
				state.isManualTime = false;
				updateTime();
			}
			updateAutoUpdateUI();
		});
	}

	const performAutoUpdate = async () => {
		if (document.hidden) return;
		if (state.autoUpdate && !state.isManualTime) {
			const isOverlayVisible = elements.overlay && elements.overlay.classList.contains('visible');
			if (isOverlayVisible) {
				// Single region loop window open: only check and update current region
				await updateOverviewMap(null, state.currentPartClass);
				updateLiveIndicator();
				if (state.activeOverlayUpdater) {
					state.activeOverlayUpdater();
				}
			} else {
				// Overview map mode: update all regions
				await updateOverviewMap();
				updateLiveIndicator();
			}
		}
	};

	setInterval(performAutoUpdate, 1000 * 60 * 2);

	let wasPlayingBeforeHidden = false;
	document.addEventListener('visibilitychange', () => {
		const isOverlayVisible = elements.overlay && elements.overlay.classList.contains('visible');
		if (document.hidden) {
			wasPlayingBeforeHidden = isOverlayVisible && state.isPlaying;
			if (state.isPlaying) pause(false);
		} else {
			if (wasPlayingBeforeHidden && isOverlayVisible) {
				play();
			} else if (state.autoUpdate && !state.isManualTime) {
				performAutoUpdate();
			}
		}
	});

	// Trigger initial map load
	adjustMapScale();
	try {
		await updateOverviewMap();
	} catch (err) {
		console.error("Failed to load initial overview map:", err);
	}
	updateLiveIndicator();
	adjustMapScale();
}

// Central Application State & Caches
export const state = {
	serviceSource: 'nmc', // 'tianqitu' or 'nmc'
	radarTime: false,
	currentPartClass: 'part2',
	currentPartName: 'ANCN',
	imageIndex: 0,
	isPlaying: true,
	scale: 1,
	translateX: 0,
	translateY: 0,
	isPanning: false,
	startX: 0,
	startY: 0,
	initialPinchDistance: null,
	imageTimes: [],
	radarFrames: [],
	preloadPromise: null,
	isPreloaded: false,
	currentPreloadId: 0,
	viewMode: 'single',
	diffStep: 1,
	animationTimeout: null,
	activeOverlayUpdater: null,
	activePanMoveHandler: null,
	activePanEndHandler: null,
	activeResizeHandler: null,
	autoUpdate: true,
	isManualTime: false,
	loopHours: 1
};

export const preloadedImages = {};
export const dbzGridCache = {};
export const colorLUT = new Map();

export const elements = {};

export function initElements() {
	elements.overlayMask = document.getElementById('overlay-mask');
	elements.overlay = document.querySelector('#large-overlay');
	if (!elements.overlay) return false;

	elements.imageViewport = elements.overlay.querySelector('.image-viewport');
	elements.overlayImage = elements.imageViewport.querySelector('img');
	elements.diffCanvas = elements.imageViewport.querySelector('#diff-canvas');
	elements.boxCanvasLeft = elements.imageViewport.querySelector('#box-canvas-left');
	elements.boxCanvasRight = elements.imageViewport.querySelector('#box-canvas-right');
	elements.overlayDatetimeLeft = elements.overlay.querySelector('#datetime-left');
	elements.overlayDatetimeRight = elements.overlay.querySelector('#datetime-right');
	elements.playPauseBtn = elements.overlay.querySelector('.play-pause');
	elements.closeBtn = elements.overlay.querySelector('.close');
	elements.spinnerOverlay = elements.overlay.querySelector('.spinner-overlay');
	elements.exportGifBtn = elements.overlay.querySelector('.export-gif-btn');
	elements.intervalGroup = elements.overlay.querySelector('#interval-select-group');
	elements.zoomInBtn = elements.overlay.querySelector('.zoom-in-btn');
	elements.zoomOutBtn = elements.overlay.querySelector('.zoom-out-btn');
	elements.zoomResetBtn = elements.overlay.querySelector('.zoom-reset-btn');
	elements.timelineTicks = elements.overlay.querySelector('#timeline-ticks');
	elements.timelineProgressBar = elements.overlay.querySelector('#timeline-progress-bar');
	elements.viewportSplitWrap = document.getElementById('viewport-split-wrap');
	elements.paneLeft = document.getElementById('pane-left');
	elements.paneRight = document.getElementById('pane-right');
	elements.cursorLeft = document.getElementById('cursor-left');
	elements.cursorRight = document.getElementById('cursor-right');
	return true;
}

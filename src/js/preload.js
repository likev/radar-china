import { state, preloadedImages, elements } from './state.js';
import { updateImage, getTimelineFrames } from './player.js';
import { enforceCacheLimit } from './config.js';

let spinnerTimeout;
export function showSpinner() {
	clearTimeout(spinnerTimeout);
	spinnerTimeout = setTimeout(() => {
		if (elements.spinnerOverlay) elements.spinnerOverlay.classList.add('visible');
	}, 150);
}

export function hideSpinner() {
	clearTimeout(spinnerTimeout);
	if (elements.spinnerOverlay) elements.spinnerOverlay.classList.remove('visible');
}

export function interpolateMissingFrame(urls, failedIndex) {
	let prevIndex = -1;
	for (let i = failedIndex - 1; i >= 0; i--) {
		if (preloadedImages[urls[i]] && !preloadedImages[urls[i]].isFailed) {
			prevIndex = i;
			break;
		}
	}
	let nextIndex = -1;
	for (let i = failedIndex + 1; i < urls.length; i++) {
		if (preloadedImages[urls[i]] && !preloadedImages[urls[i]].isFailed) {
			nextIndex = i;
			break;
		}
	}

	let sourceImg = null;
	if (prevIndex !== -1 && nextIndex !== -1) {
		sourceImg = preloadedImages[urls[prevIndex]];
	} else if (prevIndex !== -1) {
		sourceImg = preloadedImages[urls[prevIndex]];
	} else if (nextIndex !== -1) {
		sourceImg = preloadedImages[urls[nextIndex]];
	}

	if (!sourceImg || !sourceImg.complete || sourceImg.naturalWidth === 0) return;

	const w = sourceImg.naturalWidth || 600;
	const h = sourceImg.naturalHeight || 400;
	const synthCanvas = document.createElement('canvas');
	synthCanvas.width = w;
	synthCanvas.height = h;
	const ctx = synthCanvas.getContext('2d');

	if (prevIndex !== -1 && nextIndex !== -1) {
		const imgPrev = preloadedImages[urls[prevIndex]];
		const imgNext = preloadedImages[urls[nextIndex]];
		ctx.globalAlpha = 0.5;
		ctx.drawImage(imgPrev, 0, 0, w, h);
		ctx.drawImage(imgNext, 0, 0, w, h);
	} else {
		ctx.drawImage(sourceImg, 0, 0, w, h);
	}

	const interpImg = new Image();
	interpImg.src = synthCanvas.toDataURL('image/png');
	interpImg.isInterpolated = true;
	preloadedImages[urls[failedIndex]] = interpImg;
}

export function preloadAllFrames() {
	if (state.preloadPromise) return state.preloadPromise;

	const preloadId = ++state.currentPreloadId;
	showSpinner();
	const spinnerText = elements.spinnerOverlay ? elements.spinnerOverlay.querySelector('span') : null;
	let loadedCount = 0;
	const urls = (state.radarFrames || []).map(frame => frame.url);
	if (spinnerText) spinnerText.textContent = `正在预加载雷达图 (0/${urls.length})...`;

	if (urls.length === 0) {
		hideSpinner();
		state.isPreloaded = true;
		return Promise.resolve();
	}

	state.preloadPromise = Promise.all(urls.map(url => {
		return new Promise((resolve) => {
			if (preloadedImages[url] && preloadedImages[url].complete) {
				loadedCount++;
				if (preloadId === state.currentPreloadId && spinnerText) {
					spinnerText.textContent = `正在预加载雷达图 (${Math.min(urls.length, loadedCount)}/${urls.length})...`;
				}
				resolve();
				return;
			}

			fetch(url)
				.then(response => {
					if (!response.ok) throw new Error("Network response was not ok");
					return response.blob();
				})
				.then(blob => {
					const objectURL = URL.createObjectURL(blob);
					const img = new Image();
					img.crossOrigin = "anonymous";
					img.onload = () => {
						preloadedImages[url] = img;
						loadedCount++;
						if (preloadId === state.currentPreloadId && spinnerText) {
							spinnerText.textContent = `正在预加载雷达图 (${Math.min(urls.length, loadedCount)}/${urls.length})...`;
						}
						resolve();
					};
					img.onerror = () => {
						URL.revokeObjectURL(objectURL);
						const dummyFailed = new Image();
						dummyFailed.isFailed = true;
						preloadedImages[url] = dummyFailed;
						loadedCount++;
						if (preloadId === state.currentPreloadId && spinnerText) {
							spinnerText.textContent = `正在预加载雷达图 (${Math.min(urls.length, loadedCount)}/${urls.length})...`;
						}
						resolve();
					};
					img.src = objectURL;
				})
				.catch(() => {
					const dummyFailed = new Image();
					dummyFailed.isFailed = true;
					preloadedImages[url] = dummyFailed;
					loadedCount++;
					if (preloadId === state.currentPreloadId && spinnerText) {
						spinnerText.textContent = `正在预加载雷达图 (${Math.min(urls.length, loadedCount)}/${urls.length})...`;
					}
					resolve();
				});
		});
	})).then(() => {
		urls.forEach((url, i) => {
			if (preloadedImages[url] && preloadedImages[url].isFailed) {
				interpolateMissingFrame(urls, i);
			}
		});

		enforceCacheLimit(preloadedImages, 60, (img) => {
			if (img && img.src && img.src.startsWith('blob:')) {
				URL.revokeObjectURL(img.src);
			}
		});

		if (preloadId === state.currentPreloadId) {
			state.isPreloaded = true;
			hideSpinner();
			if (spinnerText) spinnerText.textContent = "正在加载数据 Loading...";
			updateImage(state.imageIndex);
		}
	});

	return state.preloadPromise;
}

export async function exportLoopToGif() {
	if (!window.GIF) {
		alert("GIF 导出库未加载完成，请稍后重试。");
		return;
	}
	const spinnerText = elements.spinnerOverlay ? elements.spinnerOverlay.querySelector('span') : null;
	const timelineFrames = getTimelineFrames();
	const frameCount = timelineFrames.length;
	if (frameCount === 0) {
		alert("暂无可导出的雷达帧");
		return;
	}

	if (spinnerText) spinnerText.textContent = `正在加载帧 1/${frameCount}...`;
	if (elements.spinnerOverlay) elements.spinnerOverlay.classList.add('visible');

	try {
		const frames = [];
		for (let i = 0; i < timelineFrames.length; i++) {
			const imgUrl = timelineFrames[i].url;
			if (spinnerText) spinnerText.textContent = `正在加载帧 ${i+1}/${frameCount}...`;

			const img = await new Promise((resolve) => {
				const image = preloadedImages[imgUrl] || new Image();
				if (image.isFailed) {
					resolve(null);
				} else if (image.complete && image.naturalWidth !== 0) {
					resolve(image);
				} else {
					image.crossOrigin = "anonymous";
					image.onload = () => resolve(image);
					image.onerror = () => resolve(null);
					image.src = imgUrl;
				}
			});
			if (img && img.naturalWidth !== 0) {
				frames.push(img);
			}
		}

		if (frames.length === 0) {
			hideSpinner();
			if (spinnerText) spinnerText.textContent = "正在加载数据 Loading...";
			alert("导出 GIF 失败，没有可用的有效帧。");
			return;
		}

		if (spinnerText) spinnerText.textContent = "正在合成 GIF 动画...";
		const gif = new GIF({
			workers: 2,
			quality: 10,
			width: frames[0].naturalWidth || 600,
			height: frames[0].naturalHeight || 400,
			workerScript: `${import.meta.env.BASE_URL}gif.worker.js`
		});

		frames.forEach(frame => {
			gif.addFrame(frame, { delay: 400 });
		});

		gif.on('finished', function(blob) {
			hideSpinner();
			if (spinnerText) spinnerText.textContent = "正在加载数据 Loading...";
			const link = document.createElement('a');
			link.href = URL.createObjectURL(blob);
			link.download = `radar_${state.currentPartName}_${Date.now()}.gif`;
			link.click();
		});

		gif.render();
	} catch (err) {
		console.error("GIF export failed:", err);
		hideSpinner();
		if (spinnerText) spinnerText.textContent = "正在加载数据 Loading...";
		alert("导出 GIF 失败，请检查网络连接后重试。");
	}
}

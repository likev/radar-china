import { state, elements } from './state.js';
import { BASE_IMAGE_URL, SVG_FALLBACK_URL, partsMap } from './config.js';

let jsonpQueue = Promise.resolve();

export function fetchRegionRadarList(radarCode) {
	jsonpQueue = jsonpQueue.then(() => new Promise((resolve) => {
		const script = document.createElement('script');
		const timeout = setTimeout(() => {
			if (script.parentNode) script.parentNode.removeChild(script);
			resolve([]);
		}, 8000);

		window.readerinfo = function(data) {
			clearTimeout(timeout);
			if (script.parentNode) script.parentNode.removeChild(script);
			if (data && data.radars && Array.isArray(data.radars)) {
				resolve(data.radars);
			} else {
				resolve([]);
			}
		};

		script.onerror = () => {
			clearTimeout(timeout);
			if (script.parentNode) script.parentNode.removeChild(script);
			resolve([]);
		};

		script.src = `https://pi-weather.tianqitu.net/d1/radar/JC_RADAR_${radarCode}_JB_V3.html?_=${Date.now()}`;
		document.head.appendChild(script);
	})).catch(() => []);

	return jsonpQueue;
}

export function getNmcUrl(partName, time) {
	const to2 = (m) => m > 9 ? m : '0' + m;
	const timeStr = `${time.getUTCFullYear()}${to2(time.getUTCMonth() + 1)}${to2(time.getUTCDate())}${to2(time.getUTCHours())}${to2(time.getUTCMinutes())}`; 
	return `https://image.nmc.cn/product/${time.getUTCFullYear()}/${to2(time.getUTCMonth() + 1)}/${to2(time.getUTCDate())}/RDCP/SEVP_AOC_RDCP_SLDAS3_ECREF_${partName}_L88_PI_${timeStr}00000.PNG`;
}

let cachedNmcTime = null;
let lastNmcCheckTimestamp = 0;

export async function findLatestValidNmcTime() {
	const nowTs = Date.now();
	// Cache probing result for 60 seconds to avoid repeating network requests continuously
	if (cachedNmcTime && (nowTs - lastNmcCheckTimestamp < 60000)) {
		return new Date(cachedNmcTime.getTime());
	}

	const candidateTimes = [];
	let time = new Date();
	let minutes = Math.floor(time.getMinutes() / 6) * 6;
	time.setMinutes(minutes);

	for (let i = 0; i < 12; i++) {
		candidateTimes.push(new Date(time.getTime()));
		time.setMinutes(time.getMinutes() - 6);
	}

	const checkImg = (url, timeoutMs = 8000) => new Promise((resolve) => {
		const img = new Image();
		const timer = setTimeout(() => {
			img.onload = null;
			img.onerror = null;
			resolve(false);
		}, timeoutMs);

		img.onload = () => {
			clearTimeout(timer);
			resolve(true);
		};
		img.onerror = () => {
			clearTimeout(timer);
			resolve(false);
		};
		img.src = url;
	});

	const validTime = await new Promise((resolve) => {
		const results = new Array(candidateTimes.length);
		let resolved = false;

		function checkEarliestValid() {
			if (resolved) return;
			for (let i = 0; i < candidateTimes.length; i++) {
				if (results[i] === true) {
					resolved = true;
					resolve(candidateTimes[i]);
					return;
				}
				if (results[i] === undefined) {
					return;
				}
			}
			resolved = true;
			resolve(candidateTimes[candidateTimes.length - 1]);
		}

		candidateTimes.forEach((candidateTime, idx) => {
			checkImg(getNmcUrl('ANCN', candidateTime)).then((valid) => {
				results[idx] = valid;
				checkEarliestValid();
			});
		});
	});

	cachedNmcTime = new Date(validTime.getTime());
	lastNmcCheckTimestamp = Date.now();
	return new Date(validTime.getTime());
}

export function format_datetime2(timeStr) { 
	if (!timeStr) return '';
	if (typeof timeStr === 'string') return timeStr;
	const to2 = (m) => m > 9 ? m : '0' + m;
	return `${timeStr.getFullYear()}-${to2(timeStr.getMonth() + 1)}-${to2(timeStr.getDate())} ${to2(timeStr.getHours())}:${to2(timeStr.getMinutes())}`; 
}

export function parse_datetime(timestr) {
	const a = timestr.split(/-|\s|:/);
	const minutes = Math.floor(parseInt(a[4], 10) / 6) * 6;
	return new Date(a[0], a[1] - 1, a[2], a[3], minutes, 0);
}

export async function updateOverviewMap(targetTime = null, targetPartKey = null) {
	const parts = (targetPartKey && partsMap[targetPartKey])
		? [[targetPartKey, partsMap[targetPartKey]]]
		: Object.entries(partsMap);

	if (state.serviceSource === 'nmc') {
		const validTime = targetTime || await findLatestValidNmcTime();
		state.radarTime = format_datetime2(validTime);
		updateTime();

		for (const [partKey, info] of parts) {
			const imgElement = document.querySelector(`div.${partKey} img`);
			if (imgElement) {
				const url = getNmcUrl(info.code, validTime);
				imgElement.src = url;
				imgElement.onerror = function() { 
					if (this.src && this.src.startsWith('data:image/svg+xml')) return;
					this.src = SVG_FALLBACK_URL; 
				};
			}
		}
		return;
	}

	for (const [partKey, info] of parts) {
		try {
			const list = await fetchRegionRadarList(info.radarCode);
			if (list && list.length > 0) {
				let currentListIndex = list.length - 1;
				
				if (targetTime) {
					const targetStr = format_datetime2(targetTime);
					let idx = list.findIndex(f => f.dt && f.dt > targetStr);
					if (idx === -1) {
						idx = list.length - 1; // All frames <= targetStr
					} else if (idx > 0) {
						idx = idx - 1; // Exactly at or before
					} else {
						idx = 0;
					}
					currentListIndex = idx;
				}

				const latest = list[currentListIndex];
				const imgElement = document.querySelector(`div.${partKey} img`);
				if (imgElement && latest && latest.fn1) {
					const url = `${BASE_IMAGE_URL}/${latest.fn1}`;
					if (imgElement.src !== url) {
						imgElement.src = url;
						imgElement.onerror = function() { 
							if (this.src && this.src.startsWith('data:image/svg+xml')) return;
							// Decrement index and step back frame by frame; fallback to SVG when exhausted
							currentListIndex--;
							if (currentListIndex >= 0 && list[currentListIndex] && list[currentListIndex].fn1) {
								this.src = `${BASE_IMAGE_URL}/${list[currentListIndex].fn1}`;
							} else {
								this.src = SVG_FALLBACK_URL;
							}
						};
					}
					if ((partKey === 'part2' || targetPartKey) && latest.dt) {
						state.radarTime = latest.dt;
						updateTime();
					}
				}
			}
		} catch (e) {
			console.warn("Failed updating map tile for", info.name, e);
		}
	}
}

export function updateTime() {
	if (!state.radarTime) return;
	const displayTime = document.getElementById('display-time');
	const radarInput = document.getElementById('radartime');
	if (displayTime) displayTime.textContent = state.radarTime;
	if (radarInput && (state.autoUpdate || document.activeElement !== radarInput)) {
		radarInput.value = state.radarTime;
	}
}

export function updateLiveIndicator() {
	const liveIndicator = document.getElementById('live-indicator');
	if (!liveIndicator) return;
	if (state.radarTime) {
		const parsedTime = new Date(state.radarTime.replace(/-/g, '/'));
		if (!isNaN(parsedTime.getTime())) {
			const diffMinutes = (Date.now() - parsedTime.getTime()) / (1000 * 60);
			if (diffMinutes <= 25) {
				liveIndicator.classList.add('active');
			} else {
				liveIndicator.classList.remove('active');
			}
			return;
		}
	}
	liveIndicator.classList.add('active');
}

let mapResizeObserver = null;

export function adjustMapScale() {
	const mapWrapper = document.getElementById('map-wrapper');
	if (!mapWrapper) return;
	const baseWidth = 1432;
	const currentWidth = mapWrapper.clientWidth;
	if (currentWidth > 0) {
		const scale = currentWidth / baseWidth;
		mapWrapper.style.setProperty('--map-scale', scale);
	}
	if (!mapResizeObserver && typeof ResizeObserver !== 'undefined') {
		mapResizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const width = entry.contentBoxSize 
					? (Array.isArray(entry.contentBoxSize) ? entry.contentBoxSize[0].inlineSize : entry.contentBoxSize.inlineSize)
					: entry.contentRect.width;
				const w = width || mapWrapper.clientWidth;
				if (w > 0) {
					mapWrapper.style.setProperty('--map-scale', w / baseWidth);
				}
			}
		});
		mapResizeObserver.observe(mapWrapper);
	}
}

import { DBZ_PALETTE, DIFF_COLORS, enforceCacheLimit } from './config.js';
import { dbzGridCache, colorLUT } from './state.js';

export function dbzToZ(dbz) {
	if (dbz === 0) return 0;
	return Math.pow(10, dbz / 10);
}

export function getDiffColor(diffZ) {
	if (diffZ === 0) return null;

	if (diffZ > 0) {
		if (diffZ < 100)        return null;
		else if (diffZ < 1000)  return DIFF_COLORS['+5'];
		else if (diffZ < 10000) return DIFF_COLORS['+15'];
		else                    return DIFF_COLORS['+30'];
	} else {
		const absDiff = Math.abs(diffZ);
		if (absDiff < 100)        return null;
		else if (absDiff < 1000)  return DIFF_COLORS['-5'];
		else if (absDiff < 10000) return DIFF_COLORS['-15'];
		else                      return DIFF_COLORS['-30'];
	}
}

export function getdBZGridFromImage(imgElement, url) {
	if (dbzGridCache[url]) return dbzGridCache[url];

	const w = imgElement.naturalWidth || imgElement.width || 600;
	const h = imgElement.naturalHeight || imgElement.height || 400;

	const offCanvas = document.createElement('canvas');
	offCanvas.width = w;
	offCanvas.height = h;
	const ctx = offCanvas.getContext('2d');
	ctx.drawImage(imgElement, 0, 0, w, h);

	let imgData;
	try {
		imgData = ctx.getImageData(0, 0, w, h);
	} catch (e) {
		console.warn("Canvas getImageData failed (CORS or canvas error):", e);
		return null;
	}

	const pixels = imgData.data;
	const totalPixels = w * h;
	const dbzArray = new Int8Array(totalPixels);

	for (let i = 0; i < totalPixels; i++) {
		const idx = i * 4;
		const r = pixels[idx];
		const g = pixels[idx + 1];
		const b = pixels[idx + 2];
		const a = pixels[idx + 3];

		if (a < 50) {
			dbzArray[i] = 0;
			continue;
		}

		const colorKey = (r << 16) | (g << 8) | b;
		let dbzVal = colorLUT.get(colorKey);
		
		if (dbzVal === undefined) {
			let minDistance = Infinity;
			let closestDbz = 0;

			for (let k = 0; k < DBZ_PALETTE.length; k++) {
				const item = DBZ_PALETTE[k];
				const dr = r - item.r;
				const dg = g - item.g;
				const db = b - item.b;
				const dist = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
				if (dist < minDistance) {
					minDistance = dist;
					closestDbz = item.dbz;
				}
			}

			if (minDistance > 3500) {
				dbzVal = 0;
			} else {
				dbzVal = closestDbz;
			}
			colorLUT.set(colorKey, dbzVal);
		}

		dbzArray[i] = dbzVal;
	}

	const result = { width: w, height: h, data: dbzArray, rawPixels: pixels };
	dbzGridCache[url] = result;
	enforceCacheLimit(dbzGridCache);
	return result;
}

export function renderDiffCanvas(currImg, prevImg, currUrl, prevUrl, canvas) {
	if (!currImg || !prevImg) return;
	const gridCurr = getdBZGridFromImage(currImg, currUrl);
	const gridPrev = getdBZGridFromImage(prevImg, prevUrl);

	if (!gridCurr || !gridPrev) return;

	const w = gridCurr.width;
	const h = gridCurr.height;

	if (canvas.width !== w || canvas.height !== h) {
		canvas.width = w;
		canvas.height = h;
	}

	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, w, h);

	const outputImgData = ctx.createImageData(w, h);
	const outPixels = outputImgData.data;

	const currData = gridCurr.data;
	const prevData = gridPrev.data;
	const len = w * h;

	let rawPixels = gridCurr.rawPixels;

	for (let i = 0; i < len; i++) {
		const idx = i * 4;
		const cVal = currData[i];
		const pVal = prevData[i];

		let isMapFeature = false;
		if (cVal === 0 && pVal === 0 && rawPixels) {
			const r = rawPixels[idx];
			const g = rawPixels[idx + 1];
			const b = rawPixels[idx + 2];
			const a = rawPixels[idx + 3];
			if (a > 50) {
				if ((r < 160 && g < 160 && b < 160) || (r < 80 && g > 130 && b > 180)) {
					isMapFeature = true;
				}
			}
		}

		if (isMapFeature) {
			outPixels[idx]     = 225;
			outPixels[idx + 1] = 230;
			outPixels[idx + 2] = 240;
			outPixels[idx + 3] = 160;
			continue;
		}

		if (cVal === 0 && pVal === 0) {
			continue;
		}

		const zCurr = dbzToZ(cVal);
		const zPrev = dbzToZ(pVal);

		const diffZ = zCurr - zPrev;

		const rgba = getDiffColor(diffZ);
		if (rgba) {
			outPixels[idx]     = rgba[0];
			outPixels[idx + 1] = rgba[1];
			outPixels[idx + 2] = rgba[2];
			outPixels[idx + 3] = rgba[3];
		}
	}

	ctx.putImageData(outputImgData, 0, 0);
}

import { elements } from './state.js';
import { getdBZGridFromImage } from './diff.js';

export function updateBoxCanvas(img, url) {
	const canvases = [elements.boxCanvasLeft, elements.boxCanvasRight].filter(Boolean);
	if (canvases.length === 0 || !img) return;
	const grid = getdBZGridFromImage(img, url);
	if (!grid) {
		canvases.forEach(canvas => {
			const ctx = canvas.getContext('2d');
			ctx.clearRect(0, 0, canvas.width, canvas.height);
		});
		return;
	}

	const w = grid.width;
	const h = grid.height;
	
	canvases.forEach(canvas => {
		if (canvas.width !== w || canvas.height !== h) {
			canvas.width = w;
			canvas.height = h;
		}
		const ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, w, h);
	});

	const boxes = [];
	const MAX_DIST = 20;
	const MAX_SIZE = 30;

	for (let y = 0; y < h; y += 2) {
		for (let x = 0; x < w; x += 2) {
			if (grid.data[y * w + x] >= 50) {
				let added = false;
				for (const b of boxes) {
					let dx = Math.max(b.minX - x, 0, x - b.maxX);
					let dy = Math.max(b.minY - y, 0, y - b.maxY);
					
					if (dx <= MAX_DIST && dy <= MAX_DIST) {
						let newMinX = Math.min(b.minX, x);
						let newMaxX = Math.max(b.maxX, x);
						let newMinY = Math.min(b.minY, y);
						let newMaxY = Math.max(b.maxY, y);
						
						if ((newMaxX - newMinX) <= MAX_SIZE && (newMaxY - newMinY) <= MAX_SIZE) {
							b.minX = newMinX;
							b.maxX = newMaxX;
							b.minY = newMinY;
							b.maxY = newMaxY;
							b.count++;
							added = true;
							break;
						}
					}
				}
				if (!added) {
					boxes.push({minX: x, maxX: x, minY: y, maxY: y, count: 1});
				}
			}
		}
	}

	const finalBoxes = boxes.filter(b => b.count >= 4);

	canvases.forEach(canvas => {
		const ctx = canvas.getContext('2d');
		ctx.strokeStyle = '#2979FF';
		ctx.lineWidth = 1;
		ctx.setLineDash([]);
		
		for (const b of finalBoxes) {
			ctx.beginPath();
			ctx.rect(Math.max(0, b.minX - 2), Math.max(0, b.minY - 2), (b.maxX - b.minX) + 4, (b.maxY - b.minY) + 4);
			ctx.stroke();
		}
	});
}

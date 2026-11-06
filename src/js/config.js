// Standard NMC Radar Reflectivity Palette & Configuration Constants
export const DBZ_PALETTE = [
	{ dbz: 10, r: 1,   g: 160, b: 246 },
	{ dbz: 15, r: 0,   g: 236, b: 246 },
	{ dbz: 20, r: 0,   g: 160, b: 0   },
	{ dbz: 25, r: 0,   g: 232, b: 0   },
	{ dbz: 30, r: 255, g: 255, b: 0   },
	{ dbz: 35, r: 231, g: 192, b: 0   },
	{ dbz: 40, r: 255, g: 144, b: 0   },
	{ dbz: 45, r: 255, g: 0,   b: 0   },
	{ dbz: 50, r: 214, g: 0,   b: 0   },
	{ dbz: 55, r: 192, g: 0,   b: 0   },
	{ dbz: 60, r: 255, g: 0,   b: 240 },
	{ dbz: 65, r: 150, g: 0,   b: 180 },
	{ dbz: 70, r: 173, g: 144, b: 240 }
];

export const DIFF_COLORS = {
	'+5':  [255, 235, 59,  230], // Yellow
	'+15': [255, 61,  0,   240], // Deep Orange
	'+30': [245, 0,   87,  255], // Pink/Magenta
	'-5':  [0,   229, 255, 230], // Cyan
	'-15': [41,  121, 255, 240], // Blue
	'-30': [101, 31,  255, 255]  // Deep Purple
};

export const BASE_IMAGE_URL = 'https://pi-weather.tianqitu.net/i/product/pic/sl';
export const SVG_FALLBACK_URL = 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27600%27%20height%3D%27400%27%20viewBox%3D%270%200%20600%20400%27%3E%3Crect%20width%3D%27600%27%20height%3D%27400%27%20fill%3D%27%23151c2d%27%2F%3E%3Ctext%20x%3D%2750%25%27%20y%3D%2750%25%27%20dominant-baseline%3D%27middle%27%20text-anchor%3D%27middle%27%20font-family%3D%27-apple-system%2C%20BlinkMacSystemFont%2C%20Segoe%20UI%2C%20Roboto%2C%20sans-serif%27%20font-size%3D%2724%27%20fill%3D%27%23ffffff%27%3EImage%20Not%20Found%3C%2Ftext%3E%3C%2Fsvg%3E';

export const partsMap = { 
	'part1': { code: 'ANWC', name: '西北', radarCode: 'XB' }, 
	'part2': { code: 'ANCN', name: '华北', radarCode: 'HB' }, 
	'part3': { code: 'ANEC', name: '东北', radarCode: 'DB' }, 
	'part4': { code: 'ASWC', name: '西南', radarCode: 'XN' }, 
	'part5': { code: 'ACCN', name: '华中', radarCode: 'HZ' }, 
	'part6': { code: 'AECN', name: '华东', radarCode: 'HD' }, 
	'part7': { code: 'ASCN', name: '华南', radarCode: 'HN' } 
};

export function enforceCacheLimit(cache, limit = 60, onEvict = null) {
	const keys = Object.keys(cache);
	if (keys.length > limit) {
		const removeCount = keys.length - limit + Math.floor(limit * 0.2);
		for (let i = 0; i < removeCount; i++) {
			const key = keys[i];
			if (onEvict) {
				onEvict(cache[key], key);
			}
			delete cache[key];
		}
	}
}

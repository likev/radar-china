import '../css/base.css';
import '../css/map.css';
import '../css/controls_form.css';
import '../css/overlay.css';
import '../css/split.css';
import '../css/timeline.css';

import { init } from './ui.js';
import { adjustMapScale } from './utils.js';

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', () => {
		adjustMapScale();
		init();
	});
} else {
	adjustMapScale();
	init();
}

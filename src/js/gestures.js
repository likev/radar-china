import { state, elements } from './state.js';
import { adjustZoom, applyTransform } from './player.js';

export function hidePaneCursors() {
	if (elements.cursorLeft) elements.cursorLeft.classList.remove('visible');
	if (elements.cursorRight) elements.cursorRight.classList.remove('visible');
}

export function bindViewportGestures() {
	if (!elements.imageViewport) return;

	elements.imageViewport.onwheel = function(e) {
		e.preventDefault();
		const pane = (e.target.closest && e.target.closest('#pane-right')) ? elements.paneRight : (elements.paneLeft || elements.imageViewport);
		const rect = pane ? pane.getBoundingClientRect() : elements.imageViewport.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;
		const factor = e.deltaY < 0 ? 1.15 : 0.85;
		adjustZoom(factor, mouseX, mouseY);
	};

	elements.imageViewport.onmousedown = function(e) {
		if (e.target.closest('.zoom-controls')) return;
		e.preventDefault(); // Prevent native browser HTML5 image drag
		state.isPanning = true;
		state.startX = e.clientX - state.translateX;
		state.startY = e.clientY - state.translateY;

		if (elements.overlayImage) elements.overlayImage.classList.add('grabbing');
		if (elements.diffCanvas) elements.diffCanvas.classList.add('grabbing');

		state.activePanMoveHandler = function(me) {
			if (!state.isPanning) return;
			state.translateX = me.clientX - state.startX;
			state.translateY = me.clientY - state.startY;
			applyTransform();
		};

		state.activePanEndHandler = function() {
			state.isPanning = false;
			if (elements.overlayImage) elements.overlayImage.classList.remove('grabbing');
			if (elements.diffCanvas) elements.diffCanvas.classList.remove('grabbing');
			window.removeEventListener('mousemove', state.activePanMoveHandler);
			window.removeEventListener('mouseup', state.activePanEndHandler);
		};

		window.addEventListener('mousemove', state.activePanMoveHandler);
		window.addEventListener('mouseup', state.activePanEndHandler);
	};

	elements.imageViewport.ontouchstart = function(e) {
		if (e.target.closest('.zoom-controls')) return;
		if (e.touches.length === 1) {
			state.isPanning = true;
			state.startX = e.touches[0].clientX - state.translateX;
			state.startY = e.touches[0].clientY - state.translateY;
		} else if (e.touches.length === 2) {
			state.isPanning = false;
			state.initialPinchDistance = Math.hypot(
				e.touches[0].clientX - e.touches[1].clientX,
				e.touches[0].clientY - e.touches[1].clientY
			);
		}
	};

	elements.imageViewport.ontouchmove = function(e) {
		if (e.touches.length === 1 && state.isPanning) {
			e.preventDefault();
			state.translateX = e.touches[0].clientX - state.startX;
			state.translateY = e.touches[0].clientY - state.startY;
			applyTransform();
		} else if (e.touches.length === 2 && state.initialPinchDistance) {
			e.preventDefault();
			const pane = (e.target.closest && e.target.closest('#pane-right')) ? elements.paneRight : (elements.paneLeft || elements.imageViewport);
			const rect = pane ? pane.getBoundingClientRect() : elements.imageViewport.getBoundingClientRect();
			const currentDistance = Math.hypot(
				e.touches[0].clientX - e.touches[1].clientX,
				e.touches[0].clientY - e.touches[1].clientY
			);
			const factor = currentDistance / state.initialPinchDistance;
			const centerTouchX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
			const centerTouchY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
			adjustZoom(factor, centerTouchX, centerTouchY);
			state.initialPinchDistance = currentDistance;
		}
	};

	elements.imageViewport.ontouchend = function() {
		state.isPanning = false;
		state.initialPinchDistance = null;
	};

	if (elements.viewportSplitWrap) {
		elements.viewportSplitWrap.addEventListener('mousemove', (e) => {
			if (state.viewMode !== 'split') return;

			const rectLeft = elements.paneLeft.getBoundingClientRect();
			const rectRight = elements.paneRight.getBoundingClientRect();

			const inLeft = (
				e.clientX >= rectLeft.left && e.clientX <= rectLeft.right &&
				e.clientY >= rectLeft.top && e.clientY <= rectLeft.bottom
			);
			const inRight = (
				e.clientX >= rectRight.left && e.clientX <= rectRight.right &&
				e.clientY >= rectRight.top && e.clientY <= rectRight.bottom
			);

			if (inLeft) {
				const rx = e.clientX - rectLeft.left;
				const ry = e.clientY - rectLeft.top;
				elements.cursorRight.style.left = rx + 'px';
				elements.cursorRight.style.top = ry + 'px';
				elements.cursorRight.classList.add('visible');

				elements.cursorLeft.style.left = rx + 'px';
				elements.cursorLeft.style.top = ry + 'px';
				elements.cursorLeft.classList.add('visible');
			} else if (inRight) {
				const rx = e.clientX - rectRight.left;
				const ry = e.clientY - rectRight.top;
				elements.cursorLeft.style.left = rx + 'px';
				elements.cursorLeft.style.top = ry + 'px';
				elements.cursorLeft.classList.add('visible');

				elements.cursorRight.style.left = rx + 'px';
				elements.cursorRight.style.top = ry + 'px';
				elements.cursorRight.classList.add('visible');
			} else {
				hidePaneCursors();
			}
		});

		elements.viewportSplitWrap.addEventListener('mouseleave', hidePaneCursors);
	}
}

type CoordinatePair = {
	x: number
	y: number
}

export class PinchZoom {
	private lastEvent: string = ""

	// zooming
	private pinchTouchIDs: Set<number> = new Set<number>()
	private lastMultiple: { pointer1: CoordinatePair; pointer2: CoordinatePair } = { pointer1: { x: 0, y: 0 }, pointer2: { x: 0, y: 0 } }
	private initialZoomableRectCoords = { x: 0, y: 0, x2: 0, y2: 0 }
	private initialViewportCoords = { x: 0, y: 0, x2: 0, y2: 0 }
	private pinchCenter: { x: number; y: number } = { x: 0, y: 0 }
	private pinchSessionTranslation: CoordinatePair = { x: 0, y: 0 }
	private readonly initialMailBodySize = { width: 0, height: 0 }
	private originalMailBodySize = { width: 0, height: 0 }
	private minimalZoomableRectSize = { width: 0, height: 0 }
	private zoomBoundaries = { min: 1, max: 3 }

	private delta = {
		x: 0,
		y: 0,
	}

	private current = {
		x: 0,
		y: 0,
		z: 1,
		zooming: false,
		width: this.originalMailBodySize.width * 1,
		height: this.originalMailBodySize.height * 1,
	}

	private last = {
		x: this.current.x,
		y: this.current.y,
		z: this.current.z,
	}

	// dragging
	private previousDelta: CoordinatePair = { x: 0, y: 0 }
	private offsetDelta: CoordinatePair = { x: 0, y: 0 }
	private previousInput: { delta: CoordinatePair; event: string } = { delta: { x: 0, y: 0 }, event: "end" }
	private dragTouchIDs: Set<number> = new Set<number>()
	private fixDeltaIssue: { x: number; y: number } = { x: 0, y: 0 }

	// double tap
	private DOUBLE_TAP_TIME_MS = 350
	private lastTap: {
		x: number
		y: number
		time: number
	} = { x: 0, y: 0, time: 0 }

	/**
	 * The size of the zoomableRect must not change. If that is the case a new PinchZoom object should be created.
	 * @precondition zoomableRect.x <= viewport.x && zoomableRect.y <= viewport.y && zoomableRect.x2 >= viewport.x2 && zoomableRect.y2 >= viewport.y2
	 * @param zoomableRect
	 * @param viewport
	 */
	constructor(private readonly zoomableRect: HTMLElement, private readonly viewport: HTMLElement, private readonly initiallyZoomToViewport: boolean) {
		this.initialZoomableRectCoords = this.getCoords(this.zoomableRect) // already needs to be rendered
		this.current.x = this.initialZoomableRectCoords.x
		this.current.y = this.initialZoomableRectCoords.y
		console.log("initialcoords", JSON.stringify(this.initialZoomableRectCoords))
		setTimeout(() => {
			console.log("initialcoords2", JSON.stringify(this.getCoords(this.zoomableRect)))
		}, 1000)
		console.log("viewportCoords", JSON.stringify(this.getCoords(this.viewport)))
		this.initialMailBodySize = {
			width: this.initialZoomableRectCoords.x2 - this.initialZoomableRectCoords.x,
			height: this.initialZoomableRectCoords.y2 - this.initialZoomableRectCoords.y,
		}

		// the content of the zoomable rect can be bigger than the rect itself due to overflow
		this.originalMailBodySize = {
			width: Math.max(this.zoomableRect.scrollWidth, this.initialZoomableRectCoords.x2 - this.initialZoomableRectCoords.x),
			height: Math.max(this.zoomableRect.scrollHeight, this.initialZoomableRectCoords.y2 - this.initialZoomableRectCoords.y),
		}
		console.log("originalSize", JSON.stringify(this.originalMailBodySize))
		this.minimalZoomableRectSize = {
			width: this.initialZoomableRectCoords.x2 - this.initialZoomableRectCoords.x,
			height: this.initialZoomableRectCoords.y2 - this.initialZoomableRectCoords.y,
		}

		this.initialViewportCoords = this.getCoords(this.viewport)

		console.log("new Pinch to zoom----------------")
		this.zoomableRect.ontouchend = (e) => {
			//FIXME remove listeners when removed from dom?
			this.removeTouches(e)
			if (e.touches.length === 0 && e.changedTouches.length === 1) {
				// FIXME still contains the touch? // e.changedTouches
				this.handleDoubleTap(
					e,
					(e) => {}, //FIXME how to do the click
					() => {
						let scale = 1
						if (this.current.z > this.zoomBoundaries.min) {
							scale = this.zoomBoundaries.min
						} else {
							scale = (this.zoomBoundaries.min + this.zoomBoundaries.max) / 2 // FIXME what would be reasonable?
						}
						const newTransformOrigin = this.calculateSessionsTranslationAndSetTransformOrigin({
							x: e.changedTouches[0].clientX,
							y: e.changedTouches[0].clientY,
						}).newTransformOrigin
						this.setCurrentSafePosition(newTransformOrigin, this.getCurrentOriginalRect(), scale)
						this.update()
					},
				)
			}
		}
		this.zoomableRect.ontouchstart = (e) => {
			//TODO double tap
		}
		this.zoomableRect.ontouchmove = (e) => {
			this.touchmove_handler(e)
		}
		this.zoomableRect.ontouchcancel = (e) => {
			this.removeTouches(e)
		}

		this.zoomableRect.style.touchAction = "pan-y pan-x" // makes zooming smooth
		this.viewport.style.overflow = "hidden" // disable default scroll behavior
		// this.zoomableRect.style.overflow = "hidden"
		// this.zoomableRect.style.overflowX = "hidden"
		// zoomableRect.ondragstart = (e) => {
		// 	console.log("dragstart")
		// 	e.preventDefault()
		// }
		// zoomableRect.ondrag = (e) => {
		// 	e.preventDefault()
		// }

		console.log("current scroll height zoomablerect", this.zoomableRect.offsetHeight)
		setTimeout(() => {
			// this.debug()
			// if (this.initiallyZoomToViewport) {
			// 	this.rescale()
			// }
		}, 1000)

		if (this.initiallyZoomToViewport) {
			this.rescale()
		}
	}

	private rescale() {
		const containerWidth = this.viewport.offsetWidth //FIXME should we also use offsetWidth for pinchZoom

		console.log("scrollWidth", this.zoomableRect.scrollWidth)
		if (containerWidth > this.zoomableRect.scrollWidth) {
			this.zoomableRect.style.transform = ""
			this.zoomableRect.style.marginBottom = ""
		} else {
			const width = this.zoomableRect.scrollWidth
			const scale = containerWidth / width

			//FIXME viewport
			const heightDiff = this.viewport.scrollHeight - this.viewport.scrollHeight * scale
			// this.viewport.style.height = `${this.originalMailBodySize.height * scale}px`
			// child.style.transform = `scale(${scale})`
			// this.viewport.style.marginBottom = `${-heightDiff}px`
			const currentViewport = this.getCoords(this.viewport)
			console.log("current height", currentViewport.y2 - currentViewport.y, this.viewport.scrollHeight)
			console.log("new height", (currentViewport.y2 - currentViewport.y) * scale)
			console.log("blocksize height", this.viewport.style.blockSize)
			console.log("client height", this.viewport.clientHeight)
			console.log("offset height", this.viewport.offsetHeight)
			console.log("rect", this.zoomableRect.style.height)

			this.viewport.style.height = `${this.viewport.scrollHeight * scale}px`

			this.minimalZoomableRectSize.height = this.minimalZoomableRectSize.height * scale
			this.zoomBoundaries = { min: scale, max: this.zoomBoundaries.max }
			this.setCurrentSafePosition({ x: 0, y: 0 }, this.getCurrentOriginalRect(), scale)
			this.update()
			// this.viewport.style.marginBottom = `${-heightDiff}px`
		}

		// ios 15 bug: transformOrigin magically disappears so we ensure that it's always set FIXME
	}

	setInitialScale(scale: number) {
		// this.current.z = scale
		// this.zoomBoundaries = { min: scale, max: scale + 2 }
		// console.log("initialZoom", scale)
		// this.originalMailBodySize = {
		// 	width: (this.initialZoomableRectCoords.x2 - this.initialZoomableRectCoords.x) / scale,
		// 	height: (this.initialZoomableRectCoords.y2 - this.initialZoomableRectCoords.y) / scale,
		// }
	}

	private touchIdCounter = 0

	private createTouch(x: number, y: number, id: number): Touch {
		return new Touch({
			clientX: x,
			clientY: y,
			force: 0,
			identifier: id,
			pageX: 0,
			pageY: 0,
			radiusX: 0,
			radiusY: 0,
			rotationAngle: 0,
			screenX: 0,
			screenY: 0,
			target: new EventTarget(),
		})
	}

	private async debug() {
		for (let i = 0; i < 20; i++) {
			this.touchmove_handler(new TouchEvent("TouchEvent", { touches: [this.createTouch(100, 350 - i, 0), this.createTouch(100, 400 + i, 1)] }))
			await new Promise((f) => setTimeout(f, 50))
		}
		await new Promise((f) => setTimeout(f, 1000))
		for (let i = 0; i < 20; i++) {
			this.touchmove_handler(new TouchEvent("TouchEvent", { touches: [this.createTouch(100, 350 - i, 2), this.createTouch(100, 450 + i, 3)] }))
			await new Promise((f) => setTimeout(f, 50))
		}
		// drag
		await new Promise((f) => setTimeout(f, 2000))
		for (let i = 0; i < 20; i++) {
			this.touchmove_handler(new TouchEvent("TouchEvent", { touches: [this.createTouch(100 + i, 350, 4)] }))
			await new Promise((f) => setTimeout(f, 500))
		}
	}

	private async debugFine() {
		for (let i = 0; i < 40; i++) {
			this.touchmove_handler(new TouchEvent("TouchEvent", { touches: [this.createTouch(100, 350 - i, 0), this.createTouch(100, 400 + i, 1)] }))
			await new Promise((f) => setTimeout(f, 50))
		}
		// drag
		await new Promise((f) => setTimeout(f, 2000))
		for (let i = 0; i < 20; i++) {
			this.touchmove_handler(new TouchEvent("TouchEvent", { touches: [this.createTouch(100 + i, 350, 4)] }))
			await new Promise((f) => setTimeout(f, 500))
		}
	}

	// change second pinch center x and y and drag in x direction -> fails
	private async dummyTest1() {
		for (let i = 0; i < 20; i++) {
			this.touchmove_handler(new TouchEvent("TouchEvent", { touches: [this.createTouch(100, 350 - i, 0), this.createTouch(100, 400 + i, 1)] }))
			await new Promise((f) => setTimeout(f, 50))
		}
		await new Promise((f) => setTimeout(f, 1000))
		for (let i = 0; i < 20; i++) {
			this.touchmove_handler(new TouchEvent("TouchEvent", { touches: [this.createTouch(120, 350 - i, 2), this.createTouch(100, 450 + i, 3)] }))
			await new Promise((f) => setTimeout(f, 50))
		}
		// drag
		await new Promise((f) => setTimeout(f, 2000))
		for (let i = 0; i < 300; i++) {
			this.touchmove_handler(new TouchEvent("TouchEvent", { touches: [this.createTouch(100 + i, 350, 4)] }))
			await new Promise((f) => setTimeout(f, 50))
		}
	}

	// change second pinch center x and drag in x direction -> works?
	private async dummyTest2() {
		for (let i = 0; i < 20; i++) {
			this.touchmove_handler(new TouchEvent("TouchEvent", { touches: [this.createTouch(100, 350 - i, 0), this.createTouch(100, 400 + i, 1)] }))
			await new Promise((f) => setTimeout(f, 50))
		}
		await new Promise((f) => setTimeout(f, 1000))
		for (let i = 0; i < 20; i++) {
			this.touchmove_handler(new TouchEvent("TouchEvent", { touches: [this.createTouch(120, 350 - i, 2), this.createTouch(100, 400 + i, 3)] }))
			await new Promise((f) => setTimeout(f, 50))
		}
		// drag
		await new Promise((f) => setTimeout(f, 2000))
		for (let i = 0; i < 300; i++) {
			this.touchmove_handler(new TouchEvent("TouchEvent", { touches: [this.createTouch(100 + i, 350, 4)] }))
			await new Promise((f) => setTimeout(f, 50))
		}
	}

	// change second pinch center y and drag in y direction -> works?
	private async dummyTest3() {
		for (let i = 0; i < 20; i++) {
			this.touchmove_handler(new TouchEvent("TouchEvent", { touches: [this.createTouch(100, 350 - i, 0), this.createTouch(100, 400 + i, 1)] }))
			await new Promise((f) => setTimeout(f, 50))
		}
		await new Promise((f) => setTimeout(f, 1000))
		for (let i = 0; i < 20; i++) {
			this.touchmove_handler(new TouchEvent("TouchEvent", { touches: [this.createTouch(100, 400 - i, 2), this.createTouch(100, 600 + i, 3)] }))
			await new Promise((f) => setTimeout(f, 50))
		}
		// drag
		await new Promise((f) => setTimeout(f, 2000))
		for (let i = 0; i < 300; i++) {
			this.touchmove_handler(new TouchEvent("TouchEvent", { touches: [this.createTouch(100, 350 + i, 4)] }))
			await new Promise((f) => setTimeout(f, 50))
		}
	}

	// change second pinch center y and drag in x direction -> fails
	private async dummyTest4() {
		for (let i = 0; i < 20; i++) {
			this.touchmove_handler(new TouchEvent("TouchEvent", { touches: [this.createTouch(100, 350 - i, 0), this.createTouch(100, 400 + i, 1)] }))
			await new Promise((f) => setTimeout(f, 50))
		}
		await new Promise((f) => setTimeout(f, 1000))
		for (let i = 0; i < 20; i++) {
			this.touchmove_handler(new TouchEvent("TouchEvent", { touches: [this.createTouch(100, 360 - i, 2), this.createTouch(100, 410 + i, 3)] }))
			await new Promise((f) => setTimeout(f, 50))
		}
		// drag
		await new Promise((f) => setTimeout(f, 2000))
		for (let i = 0; i < 300; i++) {
			this.touchmove_handler(new TouchEvent("TouchEvent", { touches: [this.createTouch(100 + i, 350, 4)] }))
			await new Promise((f) => setTimeout(f, 50))
		}
	}

	private touchmove_handler(ev: TouchEvent) {
		switch (ev.touches.length) {
			case 1:
				this.dragHandling(ev)
				break
			case 2:
				this.pinchHandling(ev)
				break
			default:
				break
		}
	}

	private removeTouches(ev: TouchEvent) {
		this.previousInput.event = "end"
		if (ev.touches.length > 0) {
			this.last.x = this.current.x
			this.last.y = this.current.y
			this.last.z = this.current.z
			this.lastEvent = "pinchend"
			this.pinchTouchIDs.clear()
		} else {
			this.last.x = this.current.x
			this.last.y = this.current.y
			this.lastEvent = "panend"
			this.dragTouchIDs.clear()
		}
	}

	private pointDistance(point1: CoordinatePair, point2: CoordinatePair): number {
		return Math.round(Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2)))
	}

	private centerOfPoints(...points: CoordinatePair[]): CoordinatePair {
		let x = 0
		let y = 0
		for (let point of points) {
			x += point.x
			y += point.y
		}
		return { x: Math.round(x / points.length), y: Math.round(y / points.length) }
	}

	private getCoords(elem: HTMLElement) {
		// crossbrowser version
		let box = elem.getBoundingClientRect()

		let body = document.body
		let docEl = document.documentElement

		let scrollTop = window.pageYOffset || docEl.scrollTop || body.scrollTop
		let scrollLeft = window.pageXOffset || docEl.scrollLeft || body.scrollLeft

		let clientTop = docEl.clientTop || body.clientTop || 0
		let clientLeft = docEl.clientLeft || body.clientLeft || 0

		let top = box.top + scrollTop - clientTop
		let left = box.left + scrollLeft - clientLeft
		let bottom = box.bottom + scrollTop - clientTop
		let right = box.right + scrollLeft - clientLeft

		// return { x: Math.round(left), y: Math.round(top), x2: Math.round(right), y2: Math.round(bottom) }
		return { x: left, y: top, x2: right, y2: bottom }
	}

	private getTransformOrigin(elem: HTMLElement): CoordinatePair {
		const computedStyle = getComputedStyle(this.zoomableRect)
		let transformOrigin = computedStyle.transformOrigin

		let numberPattern = /-?\d+\.?\d*/g
		let transformOriginValues = transformOrigin.match(numberPattern) //relative
		if (transformOriginValues) {
			return { x: Number(transformOriginValues[0]), y: Number(transformOriginValues[1]) }
		}
		return { x: 0, y: 0 }
	}

	private getCurrentOriginalRect() {
		let currentScrollOffset = this.getScrollOffset()
		return {
			x: this.initialZoomableRectCoords.x - currentScrollOffset.x,
			y: this.initialZoomableRectCoords.y - currentScrollOffset.y,
		}
	}

	/**
	 * returns the offset of the moved surrounding / viewport
	 **/
	private getScrollOffset() {
		let currentViewport = this.getCoords(this.viewport)

		return {
			x: this.initialViewportCoords.x - currentViewport.x,
			y: this.initialViewportCoords.y - currentViewport.y,
		}

		//FIXME probably remove later because not needed
		// let currentRect = this.getCoords(this.zoomableRect)
		//
		// const computedStyle = getComputedStyle(this.zoomableRect)
		// let transformMatrix = computedStyle.transform === "none" ? "matrix(1, 0, 0, 1, 0, 0)" : computedStyle.transform
		// console.log("matrix", transformMatrix)
		// let transformOrigin = computedStyle.transformOrigin
		//
		// let numberPattern = /-?\d+\.?\d*/g
		//
		// let matrixValues = transformMatrix.match(numberPattern)
		// console.log("values", matrixValues)
		// let transformOriginValues = transformOrigin.match(numberPattern) //relative
		// // let absoluteTransformOrigin
		//
		// // currentX = tX - ((uX + tX) - uX) * s
		//
		// let withoutScaling = {
		// 	x: currentRect.x + (Number(matrixValues![0]) - 1) * Number(transformOriginValues![0]), // https://www.w3schools.com/css/css3_2dtransforms.asp
		// 	y: currentRect.y + (Number(matrixValues![3]) - 1) * Number(transformOriginValues![1]),
		// }
		//
		// return {
		// 	x: withoutScaling.x - Number(matrixValues![4]),
		// 	y: withoutScaling.y - Number(matrixValues![5]),
		// }
	}

	// zooming

	private calculateSessionsTranslationAndSetTransformOrigin(absoluteZoomPosition: CoordinatePair): {
		sessionTranslation: CoordinatePair
		newTransformOrigin: CoordinatePair
	} {
		let currentZoomableRect = this.getCoords(this.zoomableRect)
		let scrollOffset = this.getScrollOffset()
		console.log("originalRect", JSON.stringify(scrollOffset))
		const computedStyles = getComputedStyle(this.zoomableRect)
		console.log("computed style", computedStyles.transform, computedStyles.transformOrigin)

		let transformedInitialZoomableRect = {
			x: (currentZoomableRect.x + absoluteZoomPosition.x * (this.current.z - 1)) / this.current.z, //FIXME round was removed
			y: (currentZoomableRect.y + absoluteZoomPosition.y * (this.current.z - 1)) / this.current.z,
		}
		console.log("transformedInitialMailbody", JSON.stringify(transformedInitialZoomableRect))
		let sessionTranslation = {
			x: transformedInitialZoomableRect.x - this.initialZoomableRectCoords.x + scrollOffset.x,
			y: transformedInitialZoomableRect.y - this.initialZoomableRectCoords.y + scrollOffset.y,
		}

		// transform origin
		let transformOrigin = {
			// is relative to the new transformed zoomableRect
			x: absoluteZoomPosition.x - transformedInitialZoomableRect.x,
			y: absoluteZoomPosition.y - transformedInitialZoomableRect.y,
		}
		console.log("pinchCenter", JSON.stringify(this.pinchCenter))
		console.log("transformOrigin", JSON.stringify(transformOrigin))
		console.log("current zoom", this.current.z)

		// this.zoomableRect.style.transformOrigin = `${transformOrigin.x}px ${transformOrigin.y}px` // zooms in the right position //FIXME approach 2

		console.log("displayed coordinates", JSON.stringify(currentZoomableRect))
		console.log("should be equals currentRectX", this.lastPinchCenter.x - (this.lastPinchCenter.x - this.initialZoomableRectCoords.x) * this.current.z)

		return { sessionTranslation: sessionTranslation, newTransformOrigin: transformOrigin }
	}

	private lastPinchCenter = { x: 0, y: 0 }

	private startPinchSession(ev: TouchEvent) {
		this.lastMultiple = {
			pointer1: { x: ev.touches[0].clientX, y: ev.touches[0].clientY },
			pointer2: { x: ev.touches[1].clientX, y: ev.touches[1].clientY },
		}

		this.lastPinchCenter = this.pinchCenter
		this.pinchCenter = this.centerOfPoints({ x: ev.touches[0].clientX, y: ev.touches[0].clientY }, { x: ev.touches[1].clientX, y: ev.touches[1].clientY })
		if (this.lastPinchCenter.x === 0 && this.lastPinchCenter.y === 0) {
			this.lastPinchCenter = this.pinchCenter
		}

		let translationAndOrigin = this.calculateSessionsTranslationAndSetTransformOrigin(this.pinchCenter)
		this.pinchSessionTranslation = translationAndOrigin.sessionTranslation
		this.getCoords(this.zoomableRect)

		return translationAndOrigin.newTransformOrigin
	}

	private pinchHandling(ev: TouchEvent) {
		// new pinch gesture?
		let transformOrigin = this.getTransformOrigin(this.zoomableRect)
		if (!(this.pinchTouchIDs.has(ev.touches[0].identifier) && this.pinchTouchIDs.has(ev.touches[1].identifier))) {
			transformOrigin = this.startPinchSession(ev)
		}
		//update current touches
		this.pinchTouchIDs = new Set<number>([ev.touches[0].identifier, ev.touches[1].identifier])

		// Calculate the scaling (1 = no scaling, 0 = maximum pinched in, >1 pinching out
		const scaling =
			this.pointDistance({ x: ev.touches[0].clientX, y: ev.touches[0].clientY }, { x: ev.touches[1].clientX, y: ev.touches[1].clientY }) /
			this.pointDistance(this.lastMultiple.pointer1, this.lastMultiple.pointer2)

		this.lastMultiple.pointer1 = { x: ev.touches[0].clientX, y: ev.touches[0].clientY }
		this.lastMultiple.pointer2 = { x: ev.touches[1].clientX, y: ev.touches[1].clientY }

		// let d2 = this.newScaledCoordinates(this.pinchCenter, scaling)
		// this.setCurrentSafePosition(d.x + this.pinchZoomOrigin.x /* + this.last.x*/, d.y + this.pinchZoomOrigin.y /* + this.last.y*/, d.z + this.last.z) //FIXME
		// this.setCurrentSafePosition(d2, this.current.z + (scaling - 1)) //FIXME // scaling prob. wrong
		this.setCurrentSafePosition(transformOrigin, this.getCurrentOriginalRect(), this.current.z + (scaling - 1))
		this.update()
	}

	// private newScaledCoordinates(zoomPosition: CoordinatePair, newScale: number) {
	// 	// console.log("zoomPosition", zoomPosition)
	// 	const currentNormalizedCoordinates = {
	// 		x: this.current.x,
	// 		y: this.current.y,
	// 		x2: this.current.x + this.originalMailBodySize.width,
	// 		y2: this.current.y + this.originalMailBodySize.height,
	// 	} // current coordinates without scaling
	// 	// zoomPosition = { x: zoomPosition.x - currentCoordinates.x, y: zoomPosition.y - currentCoordinates.y } // shift in case that display was scrolled
	// 	// console.log("corrected position", zoomPosition)
	// 	const newCoordinates = this.scaleAndShift(zoomPosition, newScale, currentNormalizedCoordinates)
	//
	// 	return { x: currentNormalizedCoordinates.x + newCoordinates.xOffset, y: currentNormalizedCoordinates.y + newCoordinates.yOffset }
	// }

	// returns the offset to the current points
	// private scaleAndShift(zoomPosition: CoordinatePair, newScale: number, currentCoordinates: { x: number; y: number; x2: number; y2: number }) {
	// 	const middle: CoordinatePair = this.centerOfPoints(
	// 		{ x: currentCoordinates.x, y: currentCoordinates.y },
	// 		{ x: currentCoordinates.x2, y: currentCoordinates.y2 },
	// 	)
	// 	// console.log("middle of zoomableRect", middle)
	//
	// 	// console.log("newScale", newScale)
	// 	// console.log("offset x", (newScale - 1) * (middle.x - zoomPosition.x))
	//
	// 	return {
	// 		xOffset: Math.round((newScale - 1) * (middle.x - zoomPosition.x)),
	// 		yOffset: Math.round((newScale - 1) * (middle.y - zoomPosition.y)),
	// 	}
	// }

	// dragging

	private dragHandling(ev: TouchEvent) {
		//FIXME check for new touch
		if (this.current.z > this.zoomBoundaries.min) {
			// ev.stopPropagation() // maybe not if is not movable FIXME
			// ev.preventDefault()

			let delta = { x: 0, y: 0 }
			if (!this.dragTouchIDs.has(ev.touches[0].identifier)) {
				// new dragging
				this.dragTouchIDs = new Set<number>([ev.touches[0].identifier])
				delta = { x: 0, y: 0 } //this.calculateDelta(true, { x: ev.touches[0].clientX, y: ev.touches[0].clientY }) //FIXME I think delta also needs to be changed if the surrounding is scrolled/ changed
			} else {
				// still same dragging
				delta = { x: ev.touches[0].clientX - this.previousInput.delta.x, y: ev.touches[0].clientY - this.previousInput.delta.y } // this.calculateDelta(false, { x: ev.touches[0].clientX, y: ev.touches[0].clientY })
			}
			this.previousInput.delta = { x: ev.touches[0].clientX, y: ev.touches[0].clientY }
			let currentRect = this.getCoords(this.zoomableRect)
			let currentOriginalRect = this.getCurrentOriginalRect()
			let newTransformOrigin = {
				x: (currentRect.x + delta.x - (currentOriginalRect.x + this.pinchSessionTranslation.x)) / (1 - this.current.z), //FIXME pinchSessionTranslation needs to be considered
				y: (currentRect.y + delta.y - (currentOriginalRect.y + this.pinchSessionTranslation.y)) / (1 - this.current.z),
			}

			let bordersReached = this.setCurrentSafePosition(newTransformOrigin, this.getCurrentOriginalRect(), this.current.z)
			if (!ev.cancelable) {
				console.log("event is cancelable", ev.cancelable, bordersReached.verticalTransformationAllowed)
			}
			if (ev.cancelable && bordersReached.verticalTransformationAllowed) {
				// console.log("preventdefault")
				// ev.stopPropagation()
				ev.preventDefault()
			}

			this.update()
		}
	}

	// double tap

	private handleDoubleTap(e: TouchEvent, singleClickAction: (e: TouchEvent) => void, doubleClickAction: (e: TouchEvent) => void) {
		const lastClick = this.lastTap.time
		const now = Date.now()
		const touch = e.changedTouches[0]

		// If there are no touches or it's not cancellable event (e.g. scroll) or more than certain time has passed or finger moved too
		// much then do nothing
		if (
			!touch ||
			!e.cancelable ||
			Date.now() - this.lastTap.time > this.DOUBLE_TAP_TIME_MS ||
			touch.clientX - this.lastTap.x > 40 ||
			touch.clientY - this.lastTap.y > 40
		) {
			this.lastTap = { x: touch.clientX, y: touch.clientY, time: now }
			return
		}

		e.preventDefault()

		if (now - lastClick < this.DOUBLE_TAP_TIME_MS) {
			this.lastTap.time = 0
			doubleClickAction(e)
		} else {
			setTimeout(() => {
				if (this.lastTap.time === now) {
					singleClickAction(e)
				}
			}, this.DOUBLE_TAP_TIME_MS)
		}

		this.lastTap = { x: touch.clientX, y: touch.clientY, time: now }
	}

	// update

	private update() {
		this.zoomableRect.style.transform = `translate3d(${this.pinchSessionTranslation.x}px, ${this.pinchSessionTranslation.y}px, 0) scale(${this.current.z})` //FIXME 1 drag approach pinchSessionTranslation
		// this.zoomableRect.style.transform = `translate3d(${this.pinchSessionTranslation.x + this.delta.x}px, ${
		// 	this.pinchSessionTranslation.y + this.delta.y
		// }px, 0) scale(${this.current.z})` //FIXME 1 drag approach pinchSessionTranslation
	}

	/**
	 * top y should not be > initial top y
	 * bottom y should not be < initial bottom y
	 * left x should not be > initial left x
	 * right x should not be < initial right x
	 * @param newX
	 * @param newY
	 * @param scaling
	 * @private
	 */
	private setCurrentSafePosition(newTransformOrigin: CoordinatePair, currentOriginalPosition: CoordinatePair, scaling: number) {
		let currentScrollOffset = this.getScrollOffset()
		let currentViewport = this.getCoords(this.viewport)
		let borders = {
			x: this.initialZoomableRectCoords.x - currentScrollOffset.x,
			y: this.initialZoomableRectCoords.y - currentScrollOffset.y,
			x2: this.initialZoomableRectCoords.x - currentScrollOffset.x + this.minimalZoomableRectSize.width,
			y2: this.initialZoomableRectCoords.y - currentScrollOffset.y + this.minimalZoomableRectSize.height,
		}
		borders = {
			x: currentViewport.x + 1, //FIXME tolerance
			y: currentViewport.y + 1,
			x2: currentViewport.x2 - 1,
			y2: currentViewport.y2 - 1,
		}

		// console.log("borders", JSON.stringify(borders), JSON.stringify(borderss))
		console.log("currentOriginalPosition", currentOriginalPosition)
		console.log("this.originalMailBodySize.width", this.originalMailBodySize.width)
		console.log("this.originalMailBodySize.height", this.originalMailBodySize.height)
		console.log("newTransformOrigin", newTransformOrigin)
		console.log("translation", this.pinchSessionTranslation)
		console.log("scaling", scaling)
		scaling = Math.max(this.zoomBoundaries.min, Math.min(this.zoomBoundaries.max, scaling)) // don't allow zooming out or zooming in more than 3x
		console.log("newScale", scaling)
		const targetedOutcome = this.simulateTransformation(
			currentOriginalPosition,
			this.originalMailBodySize.width,
			this.originalMailBodySize.height,
			newTransformOrigin,
			this.pinchSessionTranslation,
			scaling,
		)
		console.log("targeted outcome border", JSON.stringify(targetedOutcome))
		let currentTransformOrigin = this.getTransformOrigin(this.zoomableRect)

		// console.log("targeted", JSON.stringify(targetedOutcome))
		// console.log("viewport", JSON.stringify(viewportBorders))

		let horizontalTransformationAllowed = targetedOutcome.x <= borders.x && targetedOutcome.x2 >= borders.x2
		let verticalTransformationAllowed = targetedOutcome.y <= borders.y && targetedOutcome.y2 >= borders.y2

		if (horizontalTransformationAllowed && verticalTransformationAllowed) {
			//FIXME we should differentiate between each 4 sides - otherwise zooming out does not work, if only 1 border is touched
			console.log("case1")
			this.zoomableRect.style.transformOrigin = `${newTransformOrigin.x}px ${newTransformOrigin.y}px`
			this.current.z = scaling
		} else if (horizontalTransformationAllowed) {
			console.log("case2")
			this.zoomableRect.style.transformOrigin = `${newTransformOrigin.x}px ${currentTransformOrigin.y}px`
			this.current.z = scaling
		} else if (verticalTransformationAllowed) {
			console.log("case3")
			this.zoomableRect.style.transformOrigin = `${currentTransformOrigin.x}px ${newTransformOrigin.y}px`
			this.current.z = scaling
		}

		return {
			verticalTransformationAllowed,
			horizontalTransformationAllowed,
		}
	}

	private simulateTransformation(
		currentOriginalPosition: CoordinatePair,
		originalWidth: number,
		originalHeight: number,
		relativeTransformOrigin: CoordinatePair,
		translation: CoordinatePair,
		scaling: number,
	): {
		x: number
		y: number
		x2: number
		y2: number
	} {
		return {
			x: currentOriginalPosition.x + relativeTransformOrigin.x - relativeTransformOrigin.x * scaling + translation.x,
			y: currentOriginalPosition.y + relativeTransformOrigin.y - relativeTransformOrigin.y * scaling + translation.y,
			x2: currentOriginalPosition.x + relativeTransformOrigin.x + (originalWidth - relativeTransformOrigin.x) * scaling + translation.x,
			y2: currentOriginalPosition.y + relativeTransformOrigin.y + (originalHeight - relativeTransformOrigin.y) * scaling + translation.y,
		}
	}
}

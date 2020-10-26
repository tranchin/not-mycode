// @flow

import m from "mithril"


export type TransparentOverlayAttrs = {
	opacity: Stream<number>,
}

export class TransparentOverlay implements MComponent<TransparentOverlayAttrs> {
	view(vnode: Vnode<TransparentOverlayAttrs>): Children {
		const {attrs} = vnode
		return m(".fill-absolute", {
			style: {
				background: "black",
				opacity: `${attrs.opacity()}`,
				transition: "opacity 200ms ease-in-out",
				pointerEvents: "none",
			}
		})
	}
}
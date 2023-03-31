import { pureComponent } from "./gui/base/PureComponent.js"
import m from "mithril"

export const SelectableRowContainer = pureComponent((_, children) => {
	return m(".flex.mt-s.mb-s.border-radius.pt-s.pb-s.pl-s.pr.mlr", children)
})
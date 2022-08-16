import m, {Children, ClassComponent, Vnode} from "mithril"

interface BadgeAttrs {
	classes?: string
}

export default class TutanotaTeamBadge implements ClassComponent<BadgeAttrs> {
	view(vnode: Vnode<BadgeAttrs>): Children {
		return m(".b.teamLabel.pl-s.pr-s.border-radius.no-wrap" + (vnode.attrs.classes ?? ""), "Tutanota Team")
	}
}
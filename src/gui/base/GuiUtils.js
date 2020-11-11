//@flow

import type {Country} from "../../api/common/CountryList"
import {DropDownSelector} from "./DropDownSelector"
import {Countries} from "../../api/common/CountryList"
import {lang} from "../../misc/LanguageViewModel"

// TODO Use DropDownSelectorN
export function createCountryDropdown(selectedCountry: Stream<?Country>): DropDownSelector<?Country> {
	const countries = Countries.map(c => ({value: c, name: c.n}))
	countries.push({value: null, name: lang.get("choose_label")});

	const countryInput = new DropDownSelector("invoiceCountry_label",
		() => lang.get("invoiceCountryInfoConsumer_msg"),
		countries,
		selectedCountry,
		250).setSelectionChangedHandler(value => {
		selectedCountry(value)
	})
	return countryInput
}
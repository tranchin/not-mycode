/* generated file, don't edit. */


package de.tutao.tutanota.ipc

import kotlinx.serialization.*
import kotlinx.serialization.json.*

/**
 * Common operations implemented by each mobile platform.
 */
interface MobileSystemFacade {
	/**
	 * Find suggestions in the OS contact provider.
	 */
	 suspend fun findSuggestions(
		query: String,
	): List<NativeContact>
	/**
	 * Store one or more contacts in system's contact book
	 */
	 suspend fun saveContacts(
		username: String,
		contacts: List<StructuredContact>,
	): Unit
	/**
	 * Sync all Tuta contacts with system's contact book, this operation includes Inserts, Updates and Deletions
	 */
	 suspend fun syncContacts(
		username: String,
		contacts: List<StructuredContact>,
	): Unit
	/**
	 * Delete all or a specific Tuta contact from system's contact book
	 */
	 suspend fun deleteContacts(
		username: String,
		contactId: String?,
	): Unit
	/**
	 * Redirect the user to Phone's Settings
	 */
	 suspend fun goToSettings(
	): Unit
	/**
	 * Open URI in the OS.
	 */
	 suspend fun openLink(
		uri: String,
	): Boolean
	/**
	 * Share the text via OS sharing mechanism.
	 */
	 suspend fun shareText(
		text: String,
		title: String,
	): Boolean
}

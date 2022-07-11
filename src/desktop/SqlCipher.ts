import {Database, default as sqlite, RunResult} from "better-sqlite3";
import {bitArrayToUint8Array, CryptoError} from "@tutao/tutanota-crypto"
import {assertNotNull, uint8ArrayToBase64} from "@tutao/tutanota-utils"

type Parameter = null | string | number | Uint8Array
type AnonymousParameters = Array<Parameter>
type NamedParameters = Record<string, Parameter>
type Params =
	| []
	| [AnonymousParameters]
	| [NamedParameters]
	| [AnonymousParameters, NamedParameters]

export class SqlCipher {
	private _db: Database | null = null
	private get db(): Database {
		return assertNotNull(this._db)
	}

	/**
	 * @param nativeBindingPath the path to the sqlite native module
	 * @param schema a record of table name -> table definition (as would be passed into a sqlite CREATE statement)
	 */
	constructor(
		private readonly nativeBindingPath: string,
		private readonly schema: Record<string, string>
	) {
	}


	init(
		{dbPath, databaseKey, integrityCheck}:
			{
				dbPath: string,
				databaseKey: Aes256Key,
				integrityCheck: boolean,
			},
	) {
		this.openDatabase(dbPath)
		this.initSqlcipher({databaseKey, enableMemorySecurity: true, integrityCheck})
		this.createTables()
	}

	private openDatabase(dbPath: string) {
		this._db = new sqlite(dbPath, {
			// Remove ts-ignore once proper definition of Options exists, see https://github.com/DefinitelyTyped/DefinitelyTyped/discussions/59049#
			// @ts-ignore missing type
			nativeBinding: this.nativeBindingPath,
			// verbose: (message, args) => {
			// 	console.log("DB", message, args)
			// }
		})
	}

	/**
	 * Initialise sqlcipher with a database key, configuration:
	 * - Sqlcipher always uses aes-256 for encryption.
	 * - Sqlcipher always creates per page hmac for integrity with sha512.
	 * - Sqlcipher generates a database salt value randomly and stores in the first 16 bytes of the database.
	 * - We pass the database key directly to sqlcipher rather than using a password and therefore do not configure key derivation.
	 * - we assume that adding entropy to entropy pool of the crypto provide (cipher_add_random) "is not necessary [...], since [openssl] does (re-)seed itself automatically using trusted system entropy sources", https://www.openssl.org/docs/man1.1.1/man3/RAND_add.html
	 * @param databaseKey
	 * @param enableMemorySecurity if true the the memory security option (that was default until 4.5, https://www.zetetic.net/blog/2021/10/28/sqlcipher-4.5.0-release/) to wipe memory allocated by SQLite internally, including the page cache is enabled.
	 * @param integrityCheck: if true the hmac stored with each page of the database is verified to detect modification.
	 * @throws if an error is detected during the integrity check
	 */
	private initSqlcipher(
		{databaseKey, enableMemorySecurity, integrityCheck}: {
			databaseKey: Aes256Key,
			enableMemorySecurity: boolean,
			// integrity check breaks tests
			integrityCheck: boolean
		}
	) {
		if (enableMemorySecurity) {
			this.db.pragma("cipher_memory_security = ON")
		}
		const bytes = bitArrayToUint8Array(databaseKey)
		const key = `x'${uint8ArrayToBase64(bytes)};`
		this.db.pragma(`KEY = "${key}"`)

		if (integrityCheck) {
			this.checkIntegrity()
		}
	}

	private createTables() {
		for (let [name, definition] of Object.entries(this.schema)) {
			this.db.exec(`CREATE TABLE IF NOT EXISTS ${name} (${definition})`)
		}
	}

	/**
	 * Delete all data from the Database
	 */
	purge() {
		for (let name of Object.keys(this.schema)) {
			this.db.exec(`DELETE FROM ${name}`)
		}
	}

	/**
	 * Close the database
	 */
	close() {
		this.db.close()
	}

	/**
	 * Define a function that can be used in queries
	 */
	function(functionName: string, functionCallback: (...params: any[]) => any) {
		this.db.function(functionName, functionCallback)
	}

	/**
	 * Execute a pragma statement
	 */
	pragma(pragma: string): any {
		return this.db.pragma(pragma)
	}

	/**
	 * Execute a query
	 */
	transaction(callback: (...params: any[]) => void) {
		return this.db.transaction(callback).immediate()
	}

	/**
	 * Execute a query
	 */
	exec(statement: string) {
		return this.db.exec(statement)
	}

	/**
	 * Execute a query
	 */
	run(query: string, ...params: Params): RunResult {
		return this.db.prepare(query).run(...params)
	}

	/**
	 * Execute a query
	 * @returns a single object or undefined if the query returns nothing
	 */
	get(query: string, ...params: Params): any {
		return this.db.prepare(query).get(...params)
	}

	/**
	 * Execute a query
	 * @returns a list of objects or an empty list if the query returns nothing
	 */
	all(query: string, ...params: Params): Array<any> {
		return this.db.prepare(query).all(...params)
	}

	private checkIntegrity() {
		/**
		 * Throws a CryptoError if MAC verification fails
		 */
		const errors: [] = this.db.pragma("cipher_integrity_check")
		if (errors.length > 0) {
			throw new CryptoError(`Integrity check failed with result : ${JSON.stringify(errors)}`)
		}
	}
}
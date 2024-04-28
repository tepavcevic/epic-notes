const SESSION_EXPIRATION_TIME = 100 * 60 * 60 * 24 * 30

export function getSessionExpirationDate() {
	return new Date(Date.now() + SESSION_EXPIRATION_TIME)
}

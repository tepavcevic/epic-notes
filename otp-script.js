import { generateTOTP } from '@epic-web/totp'

if (process.argv.length < 3) {
	console.log('Usage: node otp-script.js <2FA otp url>')
	process.exit(1) // Exit with error
}
const otpUri = new URL(process.argv[2])
const { secret, algorithm, digits, period } = Object.fromEntries(
	otpUri.searchParams.entries(),
)

const { otp } = generateTOTP({
	secret,
	algorithm,
	digits,
	period,
})

console.log(otp)

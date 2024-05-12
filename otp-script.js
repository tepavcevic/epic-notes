import { generateTOTP } from '@epic-web/totp'

const otpUri = new URL(
	'otpauth://totp/localhost%3A3000:kody%40example.dev?secret=WKVMR5MZRL56PFYE&issuer=localhost%3A3000&algorithm=SHA1&digits=6&period=30',
)
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

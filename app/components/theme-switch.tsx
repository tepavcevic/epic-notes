import { useForm, getFormProps } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { useFetcher } from '@remix-run/react'
import { ThemeFormSchema } from '#app/root.tsx'
import { type Theme } from '#app/utils/theme.server.ts'
import { ErrorList } from './forms.tsx'
import { Icon } from './ui/icon.tsx'

export default function ThemeSwitch({
	userPreference,
}: {
	userPreference?: Theme
}) {
	// if <typeof action> is used here, TS will scream that submission does not exist on fetcher.data
	const fetcher = useFetcher<any>()

	const [form] = useForm({
		id: 'theme-switch',
		lastResult: fetcher.data?.submission,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ThemeFormSchema })
		},
	})

	const mode = userPreference ?? 'light'
	const nextMode = mode === 'light' ? 'dark' : 'light'

	const modeLabel = {
		light: (
			<Icon name="sun">
				<span className="sr-only">Light</span>
			</Icon>
		),
		dark: (
			<Icon name="moon">
				<span className="sr-only">Dark</span>
			</Icon>
		),
	}

	return (
		<fetcher.Form method="POST" {...getFormProps(form)}>
			<input type="hidden" name="theme" value={nextMode} />
			<div className="flex gap-2">
				<button
					name="intent"
					value="update-theme"
					type="submit"
					className="flex h-8 w-8 cursor-pointer items-center justify-center"
				>
					{modeLabel[mode]}
				</button>
			</div>
			<ErrorList errors={form.errors} id={form.errorId} />
		</fetcher.Form>
	)
}

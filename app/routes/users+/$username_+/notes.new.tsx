import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { requireUser } from '#app/utils/auth.server.ts'
import { invariantResponse } from '#app/utils/misc.tsx'
import { action, NoteEditor } from './__note-editor.tsx'

export { action }

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireUser(request)
	invariantResponse(params.username === user.username, 'Unauthorized', {
		status: 403,
	})

	return json({})
}

export default NoteEditor

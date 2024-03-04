import { MetaFunction } from '@remix-run/react'
import { loader } from './notes.tsx'

export default function NotesIndexRoute() {
	return (
		<div className="container pt-12">
			<p className="text-body-lg text-muted-foreground">Select a note</p>
		</div>
	)
}

export const meta: MetaFunction<
	null,
	{
		'routes/users+/$username_+/notes': typeof loader
	}
> = ({ params, matches }) => {
	const notesMatch = matches.find(
		match => match.id === 'routes/users+/$username_+/notes',
	)
	const notesData = notesMatch?.data
	const noteCount = notesData?.notes.length
	const displayName = notesData?.owner.name ?? params.username
	const noteText = noteCount === 1 ? 'note' : 'notes'

	return [
		{ title: `${displayName}'s Notes | Epic Notes` },
		{
			name: 'description',
			content: `${displayName} has ${noteCount} ${noteText}`,
		},
	]
}

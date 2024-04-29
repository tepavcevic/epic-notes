import { type LoaderFunctionArgs } from '@remix-run/node'
import { prisma } from '#app/utils/db.server.ts'
import { invariantResponse } from '#app/utils/misc.tsx'

export async function loader({ params }: LoaderFunctionArgs) {
	invariantResponse(params.imageId, 'Invalid image ID')
	const image = await prisma.noteImage.findUnique({
		where: { id: params.imageId },
		select: { contentType: true, blob: true },
	})

	invariantResponse(image, 'Image not found', { status: 404 })

	return new Response(image.blob, {
		headers: {
			'content-type': image.contentType,
			'content-length': Buffer.byteLength(image.blob).toString(),
			'content-disposition': `inline; filename="${params.imageId}"`,
			'cache-control': 'public, max-age=31536000, immutable',
		},
	})
}

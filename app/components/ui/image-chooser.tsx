import {
	getFieldsetProps,
	type FieldMetadata,
	getInputProps,
} from '@conform-to/react'
import { useState } from 'react'
import { type z } from 'zod'
import { type ImageFieldsetSchema } from '#app/routes/users+/$username_+/notes.$noteId_.edit.tsx'
import { cn } from '#app/utils/misc.tsx'
import { Label } from './label.tsx'
import { Textarea } from './textarea.tsx'

export function ImageChooser({
	config,
}: {
	config: FieldMetadata<z.infer<typeof ImageFieldsetSchema>>
}) {
	const fields = config.getFieldset()
	const existingImage = Boolean(fields.id.initialValue)

	const [previewImage, setPreviewImage] = useState<string | null>(
		existingImage ? `/resources/images/${fields.id.value}` : null,
	)
	const [altText, setAltText] = useState(fields.altText.initialValue ?? '')

	return (
		<fieldset {...getFieldsetProps(config)}>
			<div className="flex gap-3">
				<div className="w-32">
					<div className="relative h-32 w-32">
						<label
							htmlFor={fields.id.id}
							className={cn('group absolute h-32 w-32 rounded-lg', {
								'bg-accent opacity-40 focus-within:opacity-100 hover:opacity-100':
									!previewImage,
								'cursor-pointer focus-within:ring-4': !existingImage,
							})}
						>
							{previewImage ? (
								<div className="relative">
									<img
										src={previewImage}
										alt={altText ?? ''}
										className="h-32 w-32 rounded-lg object-cover"
									/>
									{existingImage ? null : (
										<div className="pointer-events-none absolute -right-0.5 -top-0.5 rotate-12 rounded-sm bg-secondary px-2 py-1 text-xs text-secondary-foreground shadow-md">
											new
										</div>
									)}
								</div>
							) : (
								<div className="flex h-32 w-32 items-center justify-center rounded-lg border border-muted-foreground text-4xl text-muted-foreground">
									➕
								</div>
							)}
							{existingImage ? (
								<input
									{...getInputProps(fields.file, {
										type: 'hidden',
									})}
								/>
							) : null}
							<input
								{...getInputProps(fields.file, { type: 'file' })}
								aria-label="Image"
								className="absolute left-0 top-0 z-0 h-32 w-32 cursor-pointer opacity-0"
								onChange={event => {
									const file = event.target.files?.[0]

									if (file) {
										const reader = new FileReader()
										reader.onloadend = () => {
											setPreviewImage(reader.result as string)
										}
										reader.readAsDataURL(file)
									} else {
										setPreviewImage(null)
									}
								}}
								accept="image/*"
							/>
						</label>
					</div>
				</div>
				<div className="flex-1">
					<Label htmlFor={fields.altText.id}>Alt Text</Label>
					<Textarea
						{...getInputProps(fields.altText, {
							type: 'text',
						})}
						onChange={e => setAltText(e.currentTarget.value)}
					/>
				</div>
			</div>
		</fieldset>
	)
}

import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogCancel,
	AlertDialogAction,
} from '@radix-ui/react-alert-dialog'
import { useLocation, useSubmit, Form } from '@remix-run/react'
import { useState, useRef, useCallback, useEffect } from 'react'
import { AlertDialogHeader, AlertDialogFooter } from './ui/alert-dialog.tsx'

export default function LogoutTimer() {
	const [status, setStatus] = useState<'idle' | 'show-modal'>('idle')
	const location = useLocation()
	const submit = useSubmit()

	const logoutTime = 1000 * 60 * 60
	const modalTime = logoutTime - 1000 * 60 * 2
	const modalTimer = useRef<ReturnType<typeof setTimeout>>()
	const logoutTimer = useRef<ReturnType<typeof setTimeout>>()

	const logout = useCallback(() => {
		submit(null, { method: 'POST', action: '/logout' })
	}, [submit])

	const cleanupTimers = useCallback(() => {
		clearTimeout(modalTimer.current)
		clearTimeout(logoutTimer.current)
	}, [])

	const resetTimers = useCallback(() => {
		cleanupTimers()
		modalTimer.current = setTimeout(() => {
			setStatus('show-modal')
		}, modalTime)
		logoutTimer.current = setTimeout(logout, logoutTime)
	}, [cleanupTimers, logout, logoutTime, modalTime])

	useEffect(() => resetTimers(), [resetTimers, location.key])
	useEffect(() => cleanupTimers, [cleanupTimers])

	function closeModal() {
		setStatus('idle')
		resetTimers()
	}

	return (
		<AlertDialog
			aria-label="Pending Logout Notification"
			open={status === 'show-modal'}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Are you still there?</AlertDialogTitle>
				</AlertDialogHeader>
				<AlertDialogDescription>
					You are going to be logged out due to inactivity. Close this modal to
					stay logged in.
				</AlertDialogDescription>
				<AlertDialogFooter className="flex items-end gap-8">
					<AlertDialogCancel onClick={closeModal}>
						Remain Logged In
					</AlertDialogCancel>
					<Form method="POST" action="/logout">
						<AlertDialogAction type="submit">Logout</AlertDialogAction>
					</Form>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

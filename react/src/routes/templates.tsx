import { createFileRoute } from '@tanstack/react-router'
import TemplatesPage from '../components/templates/TemplatesPage'

export const Route = createFileRoute('/templates')({
  component: TemplatesPage,
})
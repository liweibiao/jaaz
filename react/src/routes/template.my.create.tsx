import { createFileRoute } from '@tanstack/react-router'
import CreateTemplatePage from '../components/templates/CreateTemplatePage'

export const Route = createFileRoute('/template/my/create')({
  component: CreateTemplatePage,
})
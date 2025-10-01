import { createFileRoute } from '@tanstack/react-router'
import TemplateManagePage from '../components/templates/TemplateManagePage'

export const Route = createFileRoute('/template/manage')({
  component: TemplateManagePage,
})
import { createFileRoute } from '@tanstack/react-router'
import TemplateUsePage from '../components/templates/TemplateUsePage'

export const Route = createFileRoute('/template-use/$templateId')({
  component: TemplateUsePage,
})
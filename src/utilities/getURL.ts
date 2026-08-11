import { env } from '@/config/env'
import canUseDOM from './canUseDOM'

export const getServerSideURL = () => env.siteURL

export const getClientSideURL = () => (canUseDOM ? window.location.origin : env.siteURL)

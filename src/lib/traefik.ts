import { promises as fs } from 'fs'
import * as path from 'path'

/**
 * Traefik dynamic configuration generator for SupaPanel projects
 * Creates routing rules for each project's custom domain
 */

// Get the base path for Traefik dynamic configs
function getTraefikDynamicPath(): string {
    const mode = process.env.SUPAPANEL_MODE || 'development'
    if (mode === 'production') {
        return '/etc/supapanel/traefik/dynamic'
    }
    return path.join(process.cwd(), 'traefik', 'dynamic')
}

interface TraefikConfig {
    projectSlug: string
    domain: string
    kongPort: number
    studioPort: number
}

/**
 * Generate Traefik routing configuration for a Supabase project
 */
export async function generateProjectTraefikConfig(config: TraefikConfig): Promise<void> {
    const { projectSlug, domain, kongPort, studioPort } = config

    const traefikConfig = `# Auto-generated Traefik routing for project: ${projectSlug}
# Domain: ${domain}
# Generated at: ${new Date().toISOString()}

http:
  routers:
    # Main API router (Kong gateway)
    ${projectSlug}-api:
      rule: "Host(\`${domain}\`)"
      entryPoints:
        - websecure
      service: ${projectSlug}-api
      tls:
        certResolver: letsencrypt
      priority: 10
    
    # Studio router (subdomain)
    ${projectSlug}-studio:
      rule: "Host(\`studio.${domain}\`)"
      entryPoints:
        - websecure
      service: ${projectSlug}-studio
      tls:
        certResolver: letsencrypt
      priority: 10
    
    # HTTP redirect routers
    ${projectSlug}-api-http:
      rule: "Host(\`${domain}\`)"
      entryPoints:
        - web
      middlewares:
        - https-redirect
      service: ${projectSlug}-api
      priority: 5
    
    ${projectSlug}-studio-http:
      rule: "Host(\`studio.${domain}\`)"
      entryPoints:
        - web
      middlewares:
        - https-redirect
      service: ${projectSlug}-studio
      priority: 5

  middlewares:
    https-redirect:
      redirectScheme:
        scheme: https
        permanent: true

  services:
    ${projectSlug}-api:
      loadBalancer:
        servers:
          - url: "http://${projectSlug}-kong:${kongPort}"
        healthCheck:
          path: /health
          interval: 30s
          timeout: 5s
    
    ${projectSlug}-studio:
      loadBalancer:
        servers:
          - url: "http://${projectSlug}-studio:${studioPort}"
`

    const configPath = path.join(getTraefikDynamicPath(), `${projectSlug}.yml`)

    // Ensure directory exists
    await fs.mkdir(getTraefikDynamicPath(), { recursive: true })

    // Write the config file
    await fs.writeFile(configPath, traefikConfig)

    console.log(`Traefik config generated for project ${projectSlug} at ${configPath}`)
}

/**
 * Update an existing project's Traefik config with a new domain
 */
export async function updateProjectDomain(
    projectSlug: string,
    newDomain: string,
    kongPort: number,
    studioPort: number
): Promise<void> {
    await generateProjectTraefikConfig({
        projectSlug,
        domain: newDomain,
        kongPort,
        studioPort,
    })
}

/**
 * Remove Traefik configuration for a deleted project
 */
export async function removeProjectTraefikConfig(projectSlug: string): Promise<void> {
    const configPath = path.join(getTraefikDynamicPath(), `${projectSlug}.yml`)

    try {
        await fs.unlink(configPath)
        console.log(`Traefik config removed for project ${projectSlug}`)
    } catch (error) {
        // File may not exist if project never had a custom domain
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.error(`Failed to remove Traefik config for ${projectSlug}:`, error)
        }
    }
}

/**
 * Get the ports used by a project's services from environment variables
 */
export function getProjectPorts(envVars: Record<string, string>): { kongPort: number; studioPort: number } {
    return {
        kongPort: parseInt(envVars.KONG_HTTP_PORT || '8000', 10),
        studioPort: parseInt(envVars.STUDIO_PORT || '3000', 10),
    }
}

/**
 * Check if a domain is properly pointed to this server (basic DNS check)
 * Returns true if the domain resolves to an IP that could be this server
 */
export async function verifyDomainDNS(domain: string): Promise<boolean> {
    try {
        // Use Node's DNS module for resolution
        const dns = await import('dns').then(m => m.promises)
        const addresses = await dns.resolve4(domain)

        // Domain resolves to at least one IP
        return addresses.length > 0
    } catch {
        // DNS resolution failed
        return false
    }
}

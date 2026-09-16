import { promises as fs } from 'fs'
import * as path from 'path'
import { exec, execFile } from 'child_process'
import { promisify } from 'util'
import { prisma } from './db'
import { removeProjectTraefikConfig } from './traefik'

import { corePath, projectsPath, secret, jwt, serializeEnv, prepareCompose, supabaseRef, isDokploy } from './runtime'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

const getProjectsBasePath = projectsPath
const getCoreBasePath = corePath
const generateRandomString = secret

// Pre-flight checks for Docker deployment
async function checkDockerPrerequisites() {
  const checks = {
    docker: false,
    dockerCompose: false,
    internetConnection: false,
  }

  try {
    await execAsync('docker --version')
    checks.docker = true
  } catch {
    // Docker not available
  }

  try {
    await execAsync('docker compose version')
    checks.dockerCompose = true
  } catch {
    // Docker Compose not available
  }

  // Multi-layered internet connectivity check
  checks.internetConnection = await checkInternetConnectivity()

  return checks
}

// Improved internet connectivity check using multiple methods
async function checkInternetConnectivity(): Promise<boolean> {
  // Method 1: HTTP connectivity test to multiple reliable endpoints
  const httpEndpoints = [
    'https://www.google.com',
    'https://1.1.1.1', // Cloudflare DNS
    'https://8.8.8.8', // Google DNS
  ]

  for (const endpoint of httpEndpoints) {
    try {
      // Use curl for HTTP connectivity test with short timeout
      await execAsync(`curl -s --max-time 10 --head ${endpoint}`, { timeout: 15000 })
      return true // If any endpoint succeeds, we have internet
    } catch {
      // Try next endpoint
      continue
    }
  }

  // Method 2: DNS resolution test
  try {
    await execAsync('nslookup google.com', { timeout: 10000 })
    return true
  } catch {
    // DNS resolution failed
  }

  // Method 3: Ping test (as fallback)
  try {
    const pingCommand = process.platform === 'win32'
      ? 'ping -n 1 8.8.8.8'
      : 'ping -c 1 8.8.8.8'
    await execAsync(pingCommand, { timeout: 10000 })
    return true
  } catch {
    // Ping failed
  }

  // Method 4: Docker registry connectivity (original method as last resort)
  try {
    await execAsync('docker pull alpine:latest', {
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 5 // 5MB buffer for Docker pull
    })
    return true
  } catch {
    // All methods failed
  }

  return false
}

let initialization: Promise<{ success: boolean; error?: string }> | undefined
export async function initializeSupabaseCore() {
  if (initialization) return initialization
  initialization = (async () => {
    const target = path.join(getCoreBasePath(), 'releases', supabaseRef())
    try {
      if (!/^[a-zA-Z0-9._-]+$/.test(supabaseRef())) throw new Error('Invalid Supabase ref')
      await fs.mkdir(getProjectsBasePath(), { recursive: true })
      try { await fs.access(path.join(target, 'docker', 'docker-compose.yml')); return { success: true } } catch {}
      await fs.mkdir(path.dirname(target), { recursive: true })
      const staging = `${target}.tmp-${secret(12)}`
      try {
        await fs.mkdir(staging)
        await execFileAsync('git', ['init', staging])
        await execFileAsync('git', ['remote', 'add', 'origin', process.env.SUPABASE_CORE_REPO_URL || 'https://github.com/supabase/supabase'], { cwd: staging })
        await execFileAsync('git', ['sparse-checkout', 'set', 'docker'], { cwd: staging })
        await execFileAsync('git', ['fetch', '--filter=blob:none', '--depth', '1', 'origin', supabaseRef()], { cwd: staging, timeout: 300000 })
        await execFileAsync('git', ['checkout', '--detach', 'FETCH_HEAD'], { cwd: staging, timeout: 120000 })
        await fs.access(path.join(staging, 'docker', 'docker-compose.yml'))
        await fs.rename(staging, target)
      } finally { await fs.rm(staging, { recursive: true, force: true }) }
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Initialization failed' }
    }
  })()
  try { return await initialization } finally { initialization = undefined }
}

export async function createProject(name: string, userId: string, description?: string) {
  let createdId: string | undefined
  let createdDir: string | undefined
  try {
    const initialized = await initializeSupabaseCore()
    if (!initialized.success) throw new Error(initialized.error)
    // Generate unique slug
    const timestamp = Date.now()
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40)}-${secret(12)}`

    // Create project in database
    const project = await prisma.project.create({
      data: {
        name,
        slug,
        description,
        ownerId: userId,
        status: 'stopped',
      },
    })

    createdId = project.id
    // Create project directory
    const projectDir = path.join(getProjectsBasePath(), slug)
    const coreDockerDir = path.join(getCoreBasePath(), 'releases', supabaseRef(), 'docker')

    createdDir = projectDir
    await fs.cp(coreDockerDir, path.join(projectDir, 'docker'), { recursive: true })
    const dockerComposeFile = path.join(projectDir, 'docker', 'docker-compose.yml')
    await fs.writeFile(dockerComposeFile, prepareCompose(await fs.readFile(dockerComposeFile, 'utf8'), slug))
    await fs.writeFile(path.join(projectDir, 'supapanel-version.json'), JSON.stringify({ ref: supabaseRef(), createdAt: new Date().toISOString() }, null, 2))
    const jwtSecret = secret(64)

    // Generate unique default port values to prevent conflicts
    const basePort = 8000 + (timestamp % 10000) // Use last 4 digits of timestamp for uniqueness
    const defaultEnvVars = {
      // Secrets - generated random values
      POSTGRES_PASSWORD: generateRandomString(32),
      JWT_SECRET: jwtSecret,
      ANON_KEY: jwt('anon', jwtSecret, timestamp),
      SERVICE_ROLE_KEY: jwt('service_role', jwtSecret, timestamp),
      DASHBOARD_USERNAME: 'supabase',
      DASHBOARD_PASSWORD: generateRandomString(16),
      SECRET_KEY_BASE: generateRandomString(64),
      VAULT_ENC_KEY: generateRandomString(32),

      // Unique ports to prevent conflicts between projects
      POSTGRES_PORT: '5432',
      POOLER_HOST_PORT: (basePort + 2000).toString(),
      PG_META_CRYPTO_KEY: secret(64),
      REALTIME_DB_ENC_KEY: secret(16),
      SUPABASE_PUBLISHABLE_KEY: '',
      SUPABASE_SECRET_KEY: '',
      GLOBAL_S3_BUCKET: 'storage',
      STORAGE_TENANT_ID: slug,
      REGION: 'local',
      S3_PROTOCOL_ACCESS_KEY_ID: secret(32),
      S3_PROTOCOL_ACCESS_KEY_SECRET: secret(64),
      IMGPROXY_AUTO_WEBP: 'true',
      POOLER_PROXY_PORT_TRANSACTION: (basePort + 3000).toString(),
      KONG_HTTP_PORT: basePort.toString(),
      KONG_HTTPS_PORT: (basePort + 443).toString(),
      ANALYTICS_PORT: (basePort + 1000).toString(),

      // Database
      POSTGRES_HOST: 'db',
      POSTGRES_DB: 'postgres',

      // Other defaults
      POOLER_DEFAULT_POOL_SIZE: '20',
      POOLER_MAX_CLIENT_CONN: '100',
      POOLER_TENANT_ID: `project-${timestamp}`,
      POOLER_DB_POOL_SIZE: '5',
      PGRST_DB_SCHEMAS: 'public,graphql_public',
      SITE_URL: `http://localhost:${basePort}`,
      ADDITIONAL_REDIRECT_URLS: '',
      JWT_EXPIRY: '3600',
      DISABLE_SIGNUP: 'false',
      API_EXTERNAL_URL: `http://localhost:${basePort}/auth/v1`,
      MAILER_URLPATHS_CONFIRMATION: '/auth/v1/verify',
      MAILER_URLPATHS_INVITE: '/auth/v1/verify',
      MAILER_URLPATHS_RECOVERY: '/auth/v1/verify',
      MAILER_URLPATHS_EMAIL_CHANGE: '/auth/v1/verify',
      ENABLE_EMAIL_SIGNUP: 'true',
      ENABLE_EMAIL_AUTOCONFIRM: 'false',
      SMTP_ADMIN_EMAIL: 'admin@example.com',
      SMTP_HOST: 'supabase-mail',
      SMTP_PORT: '2500',
      SMTP_USER: 'fake_mail_user',
      SMTP_PASS: 'fake_mail_password',
      SMTP_SENDER_NAME: 'fake_sender',
      ENABLE_ANONYMOUS_USERS: 'false',
      ENABLE_PHONE_SIGNUP: 'true',
      ENABLE_PHONE_AUTOCONFIRM: 'true',
      STUDIO_DEFAULT_ORGANIZATION: 'Default Organization',
      STUDIO_DEFAULT_PROJECT: name,
      STUDIO_PORT: (basePort + 100).toString(),
      SUPABASE_PUBLIC_URL: `http://localhost:${basePort}`,
      IMGPROXY_ENABLE_WEBP_DETECTION: 'true',
      OPENAI_API_KEY: '',
      FUNCTIONS_VERIFY_JWT: 'true',
      LOGFLARE_PUBLIC_ACCESS_TOKEN: generateRandomString(64),
      LOGFLARE_PRIVATE_ACCESS_TOKEN: generateRandomString(64),
      DOCKER_SOCKET_LOCATION: '/var/run/docker.sock',
      GOOGLE_PROJECT_ID: 'GOOGLE_PROJECT_ID',
      GOOGLE_PROJECT_NUMBER: 'GOOGLE_PROJECT_NUMBER'
    }

    // Write initial .env file with unique defaults
    const envFilePath = path.join(projectDir, 'docker', '.env')
    await fs.writeFile(envFilePath, serializeEnv(defaultEnvVars), { mode: 0o600 })

    // Save environment variables to database
    for (const [key, value] of Object.entries(defaultEnvVars)) {
      await prisma.projectEnvVar.create({
        data: {
          projectId: project.id,
          key,
          value,
        },
      })
    }

    return { success: true, project }
  } catch (error) {
    if (createdId) await prisma.project.delete({ where: { id: createdId } }).catch(() => {})
    if (createdDir) await fs.rm(createdDir, { recursive: true, force: true })
    console.error('Failed to create project:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function updateProjectEnvVars(projectId: string, envVars: Record<string, string>) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    })

    if (!project) {
      throw new Error('Project not found')
    }

    serializeEnv(envVars) // Validate before persisting.
    const previousJwt = await prisma.projectEnvVar.findUnique({ where: { projectId_key: { projectId, key: 'JWT_SECRET' } } })
    if (envVars.JWT_SECRET && envVars.JWT_SECRET !== previousJwt?.value) {
      envVars.ANON_KEY = jwt('anon', envVars.JWT_SECRET)
      envVars.SERVICE_ROLE_KEY = jwt('service_role', envVars.JWT_SECRET)
    }
    // Update environment variables in database
    for (const [key, value] of Object.entries(envVars)) {
      await prisma.projectEnvVar.upsert({
        where: {
          projectId_key: {
            projectId,
            key,
          },
        },
        update: { value },
        create: {
          projectId,
          key,
          value,
        },
      })
    }

    // Update .env file in project directory
    const projectDir = path.join(getProjectsBasePath(), project.slug, 'docker')
    const envFilePath = path.join(projectDir, '.env')

    const saved = await prisma.projectEnvVar.findMany({ where: { projectId } })
    await fs.writeFile(envFilePath, serializeEnv(Object.fromEntries(saved.map(v => [v.key, v.value]))), { mode: 0o600 })

    return { success: true }
  } catch (error) {
    console.error('Failed to update project env vars:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function deployProject(projectId: string) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    })

    if (!project) {
      throw new Error('Project not found')
    }

    const projectDir = path.join(getProjectsBasePath(), project.slug, 'docker')

    if (isDokploy() && !project.domain && !project.studioDomain) throw new Error('Configure an API or Studio domain before deploying on Dokploy.')

    // Run pre-flight checks
    console.log('Running pre-flight checks...')
    const checks = await checkDockerPrerequisites()

    if (!checks.docker) {
      throw new Error('Docker is not installed or not running. Please install Docker Desktop and ensure it is started before deploying.')
    }

    if (!checks.dockerCompose) {
      throw new Error('Docker Compose is not available. Please ensure Docker Desktop includes Docker Compose or install it separately.')
    }

    // Try to run Docker commands with better error handling
    try {
      // Only pull images if we have internet connectivity
      if (checks.internetConnection) {
        console.log('Attempting to pull latest Docker images...')
        try {
          await execAsync('docker compose pull', {
            cwd: projectDir,
            timeout: 300000, // 5 minute timeout
            maxBuffer: 1024 * 1024 * 10 // 10MB buffer
          })
        } catch (pullError) {
          console.warn('Failed to pull some images, will try to use existing/cached images:', pullError)
          // Continue with deployment even if pull fails
        }
      } else {
        console.warn('No internet connectivity detected, using cached Docker images')
      }

      // Start the services
      console.log('Starting Supabase services...')
      await execAsync('docker compose up -d --wait --wait-timeout 240 --remove-orphans', {
        cwd: projectDir,
        timeout: 300000, // 5 minute timeout
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      })

    } catch (composeError) {
      // If the main docker compose command fails, provide better error message
      const errorMessage = composeError instanceof Error ? composeError.message : 'Unknown Docker error'

      if (errorMessage.includes('maxBuffer length exceeded')) {
        throw new Error('Docker deployment generated too much output. This usually means the deployment is working but Docker is downloading many large images. Please wait a few more minutes and check Docker Desktop to see if containers are starting. You can also try running "docker compose up -d" manually in the project directory.')
      } else if (errorMessage.includes('no such host') || errorMessage.includes('dial tcp')) {
        throw new Error('Network connectivity issue: Unable to reach Docker registry. This might be due to:\n\n1. Internet connection issues\n2. Corporate firewall blocking Docker registry\n3. DNS resolution problems\n\nSolution: Try running "docker pull supabase/postgres" manually to test connectivity, or work with your IT team to allow access to Docker Hub.')
      } else if (errorMessage.includes('permission denied')) {
        throw new Error('Docker permission denied. Please ensure:\n\n1. Docker Desktop is running\n2. Your user is in the "docker" group (Linux/Mac)\n3. You have administrator privileges (Windows)')
      } else if (errorMessage.includes('not found')) {
        throw new Error('Docker or Docker Compose not found. Please install Docker Desktop from https://docker.com/products/docker-desktop')
      } else if (errorMessage.includes('image') && errorMessage.includes('not found')) {
        throw new Error('Required Docker images not found. Please ensure you have internet connectivity and try again, or manually pull images with "docker compose pull"')
      } else {
        throw new Error(`Docker deployment failed: ${errorMessage}`)
      }
    }

    // Update project status
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'active' },
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to deploy project:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function pauseProject(projectId: string) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    })

    if (!project) {
      throw new Error('Project not found')
    }

    const projectDir = path.join(getProjectsBasePath(), project.slug, 'docker')

    // Stop Docker containers
    await execAsync('docker compose stop', { cwd: projectDir })

    // Update project status
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'paused' },
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to pause project:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function deleteProject(projectId: string) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    })

    if (!project) {
      throw new Error('Project not found')
    }

    const projectDir = path.join(getProjectsBasePath(), project.slug)
    const dockerDir = path.join(projectDir, 'docker')

    // Step 1: Stop and remove Docker containers
    try {
      console.log(`Stopping Docker containers for project ${project.slug}...`)
      await execAsync('docker compose down --volumes --remove-orphans', {
        cwd: dockerDir,
        timeout: 120000, // 2 minutes timeout
        maxBuffer: 1024 * 1024 * 5 // 5MB buffer
      })
    } catch (dockerError) {
      console.warn('Failed to stop Docker containers (they may not be running):', dockerError)
      throw new Error('Container cleanup failed. Project data was preserved; retry after Docker is available.')
    }

    // Step 1.5: Remove Traefik configuration
    try {
      console.log(`Removing Traefik config for project ${project.slug}...`)
      await removeProjectTraefikConfig(project.slug)
    } catch (traefikError) {
      console.warn('Failed to remove Traefik config:', traefikError)
    }

    // Step 2: Remove project directory
    try {
      console.log(`Removing project directory: ${projectDir}`)
      await fs.rm(projectDir, { recursive: true, force: true })
    } catch (fsError) {
      console.warn('Failed to remove project directory:', fsError)
      throw new Error('Could not remove project files; database record was preserved.')
    }

    // Step 3: Clean up database records
    try {
      // Delete project environment variables
      await prisma.projectEnvVar.deleteMany({
        where: { projectId },
      })

      // Delete the project itself
      await prisma.project.delete({
        where: { id: projectId },
      })
    } catch (dbError) {
      console.error('Failed to clean up database records:', dbError)
      throw new Error('Failed to remove project from database')
    }

    console.log(`Project ${project.slug} deleted successfully`)
    return { success: true }
  } catch (error) {
    console.error('Failed to delete project:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
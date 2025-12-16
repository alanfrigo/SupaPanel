import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { validateSession } from '@/lib/auth'
import { cookies } from 'next/headers'
import { generateProjectTraefikConfig, verifyDomainDNS, getProjectPorts } from '@/lib/traefik'

/**
 * GET /api/projects/[id]/domain
 * Get the domain configuration for a project
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Validate session
        const cookieStore = await cookies()
        const sessionToken = cookieStore.get('session')?.value
        if (!sessionToken) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const session = await validateSession(sessionToken)
        if (!session) {
            return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
        }

        const { id } = await params

        const project = await prisma.project.findUnique({
            where: { id },
            select: {
                id: true,
                domain: true,
                domainVerified: true,
            },
        })

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }

        return NextResponse.json({
            domain: project.domain,
            verified: project.domainVerified,
        })
    } catch (error) {
        console.error('Get domain error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

/**
 * PUT /api/projects/[id]/domain
 * Set or update the custom domain for a project
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Validate session
        const cookieStore = await cookies()
        const sessionToken = cookieStore.get('session')?.value
        if (!sessionToken) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const session = await validateSession(sessionToken)
        if (!session) {
            return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
        }

        const { id } = await params
        const { domain } = await request.json()

        if (!domain) {
            return NextResponse.json({ error: 'Domain is required' }, { status: 400 })
        }

        // Validate domain format
        const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-_.]*\.[a-zA-Z]{2,}$/
        if (!domainRegex.test(domain)) {
            return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 })
        }

        // Check if project exists
        const project = await prisma.project.findUnique({
            where: { id },
            include: {
                envVars: true,
            },
        })

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }

        // Check if domain is already in use by another project
        const existingProject = await prisma.project.findFirst({
            where: {
                domain,
                id: { not: id },
            },
        })

        if (existingProject) {
            return NextResponse.json({ error: 'Domain is already in use' }, { status: 409 })
        }

        // Verify domain DNS points to this server
        const dnsValid = await verifyDomainDNS(domain)

        // Update the project's domain
        const updatedProject = await prisma.project.update({
            where: { id },
            data: {
                domain,
                domainVerified: dnsValid,
            },
        })

        // Generate Traefik configuration for this project
        const envVarsMap: Record<string, string> = {}
        project.envVars.forEach(env => {
            envVarsMap[env.key] = env.value
        })
        const ports = getProjectPorts(envVarsMap)

        await generateProjectTraefikConfig({
            projectSlug: project.slug,
            domain,
            kongPort: ports.kongPort,
            studioPort: ports.studioPort,
        })

        return NextResponse.json({
            success: true,
            domain: updatedProject.domain,
            verified: updatedProject.domainVerified,
            message: dnsValid
                ? 'Domain configured and verified successfully'
                : 'Domain configured. DNS verification pending - make sure your domain points to this server.',
        })
    } catch (error) {
        console.error('Set domain error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

/**
 * DELETE /api/projects/[id]/domain
 * Remove the custom domain from a project
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Validate session
        const cookieStore = await cookies()
        const sessionToken = cookieStore.get('session')?.value
        if (!sessionToken) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const session = await validateSession(sessionToken)
        if (!session) {
            return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
        }

        const { id } = await params

        const project = await prisma.project.findUnique({
            where: { id },
        })

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }

        // Update the project (remove domain)
        await prisma.project.update({
            where: { id },
            data: {
                domain: null,
                domainVerified: false,
            },
        })

        // Remove Traefik configuration
        const { removeProjectTraefikConfig } = await import('@/lib/traefik')
        await removeProjectTraefikConfig(project.slug)

        return NextResponse.json({
            success: true,
            message: 'Domain removed successfully',
        })
    } catch (error) {
        console.error('Delete domain error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

import { NextRequest, NextResponse } from 'next/server'
import { validateSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getProjectDockerStatus, getProjectContainerLogs, getProjectStudioUrl } from '@/lib/project'

interface RouteContext {
    params: Promise<{
        id: string
    }>
}

export async function GET(request: NextRequest, { params }: RouteContext) {
    const { id } = await params
    try {
        const sessionToken = request.cookies.get('session')?.value

        if (!sessionToken) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const session = await validateSession(sessionToken)
        if (!session) {
            return NextResponse.json(
                { error: 'Invalid session' },
                { status: 401 }
            )
        }

        // Get project from database
        const project = await prisma.project.findUnique({
            where: { id },
            select: {
                id: true,
                slug: true,
                status: true,
                deployStatus: true,
                lastDeployAt: true,
                lastDeployError: true,
                studioDomain: true,
                studioDomainVerified: true,
            }
        })

        if (!project) {
            return NextResponse.json(
                { error: 'Project not found' },
                { status: 404 }
            )
        }

        // Get real-time Docker status
        const dockerStatus = await getProjectDockerStatus(project.slug)

        // Get Studio URL
        const studioUrl = await getProjectStudioUrl(id)

        return NextResponse.json({
            projectStatus: project.status,
            deployStatus: project.deployStatus,
            lastDeployAt: project.lastDeployAt,
            lastDeployError: project.lastDeployError,
            docker: dockerStatus,
            studioUrl,
        })
    } catch (error) {
        console.error('Get project status error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

// Endpoint to get container logs
export async function POST(request: NextRequest, { params }: RouteContext) {
    const { id } = await params
    try {
        const sessionToken = request.cookies.get('session')?.value

        if (!sessionToken) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const session = await validateSession(sessionToken)
        if (!session) {
            return NextResponse.json(
                { error: 'Invalid session' },
                { status: 401 }
            )
        }

        // Get project from database
        const project = await prisma.project.findUnique({
            where: { id },
            select: { slug: true }
        })

        if (!project) {
            return NextResponse.json(
                { error: 'Project not found' },
                { status: 404 }
            )
        }

        // Get request body for options
        const body = await request.json().catch(() => ({}))
        const tailLines = body.tailLines || 100

        // Get container logs
        const logsResult = await getProjectContainerLogs(project.slug, tailLines)

        if (!logsResult.success) {
            return NextResponse.json(
                { error: logsResult.error },
                { status: 500 }
            )
        }

        return NextResponse.json({
            logs: logsResult.logs,
        })
    } catch (error) {
        console.error('Get project logs error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

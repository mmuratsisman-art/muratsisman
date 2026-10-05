import { projects } from '@/data/projects';
import ProjectCard from '@/components/ui/ProjectCard';
import SectionHeading from '@/components/ui/SectionHeading';

export default function SelectedProjects() {
  return (
    <section id="projects" aria-labelledby="projects-title" className="bg-projects py-20 sm:py-28">
      <div className="shell">
        <SectionHeading id="projects-title" title="SELECTED PROJECTS" />
        <div className="grid gap-4 md:grid-cols-12 md:gap-5">
          {projects.map((p) => (
            <ProjectCard key={p.slug} project={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

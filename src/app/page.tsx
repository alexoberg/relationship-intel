import Link from 'next/link';
import { ArrowRight, Users, Sparkles, Target, Zap, Shield, BarChart3 } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-dark-100">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-dark-900">Relationship Intel</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="btn-ghost">
              Sign in
            </Link>
            <Link href="/login" className="btn-primary">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 bg-mesh" />
        <div className="absolute inset-0 bg-grid" />

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-50 border border-primary-100 mb-8 animate-fade-in">
              <Zap className="w-4 h-4 text-primary-600" />
              <span className="text-sm font-medium text-primary-700">AI-Powered Network Intelligence</span>
            </div>

            {/* Headline */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-dark-900 mb-6 animate-slide-up tracking-tight">
              Turn your network into
              <span className="block gradient-text">revenue opportunities</span>
            </h1>

            {/* Subheadline */}
            <p className="text-xl text-dark-500 mb-10 max-w-2xl mx-auto animate-slide-up leading-relaxed" style={{ animationDelay: '0.1s' }}>
              Connect your team's LinkedIn, Gmail, and Calendar to discover VCs, angels, and sales prospects hiding in your collective network.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
              <Link href="/login" className="btn-primary text-base px-8 py-4">
                Start for Free
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
              <Link href="#features" className="btn-secondary text-base px-8 py-4">
                See How It Works
              </Link>
            </div>

            {/* Trust badges */}
            <div className="mt-12 flex items-center justify-center gap-8 text-dark-400 text-sm animate-fade-in" style={{ animationDelay: '0.3s' }}>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                <span>SOC 2 Compliant</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span>Team Collaboration</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                <span>Real-time Sync</span>
              </div>
            </div>
          </div>

          {/* Hero visual */}
          <div className="mt-20 relative animate-slide-up" style={{ animationDelay: '0.4s' }}>
            <div className="absolute -inset-4 bg-gradient-to-r from-primary-500/20 via-accent-purple/20 to-accent-pink/20 rounded-3xl blur-3xl" />
            <div className="relative bg-dark-900 rounded-2xl border border-dark-700/50 p-2 shadow-2xl">
              <div className="bg-dark-950 rounded-xl p-8">
                <div className="grid grid-cols-4 gap-4">
                  {/* Stats preview */}
                  {[
                    { label: 'Total Contacts', value: '2,847', color: 'from-primary-500 to-primary-600' },
                    { label: 'VCs Found', value: '156', color: 'from-purple-500 to-purple-600' },
                    { label: 'Angels Found', value: '89', color: 'from-blue-500 to-blue-600' },
                    { label: 'Avg Proximity', value: '72', color: 'from-emerald-500 to-emerald-600' },
                  ].map((stat, i) => (
                    <div key={i} className="bg-dark-800/50 rounded-xl p-4 border border-dark-700/50">
                      <div className={`text-2xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>
                        {stat.value}
                      </div>
                      <div className="text-dark-400 text-sm mt-1">{stat.label}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-24 bg-dark-800/30 rounded-xl border border-dark-700/30 animate-pulse" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-dark-50/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-dark-900 mb-4">
              How it works
            </h2>
            <p className="text-lg text-dark-500 max-w-2xl mx-auto">
              Three simple steps to unlock the full potential of your network
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Users,
                color: 'from-primary-500 to-primary-600',
                bgColor: 'bg-primary-50',
                title: 'Connect Your Network',
                description: 'Import LinkedIn connections, connect Gmail and Google Calendar. Invite your team to pool network data.',
                step: '01'
              },
              {
                icon: Sparkles,
                color: 'from-purple-500 to-purple-600',
                bgColor: 'bg-purple-50',
                title: 'Enrich & Score',
                description: 'Pull full work history from People Data Labs. Calculate proximity scores based on interaction patterns.',
                step: '02'
              },
              {
                icon: Target,
                color: 'from-emerald-500 to-emerald-600',
                bgColor: 'bg-emerald-50',
                title: 'Categorize & Act',
                description: 'AI auto-categorizes contacts as VCs, Angels, Sales Prospects, or Irrelevant. Focus on what matters.',
                step: '03'
              }
            ].map((feature, i) => (
              <div key={i} className="group relative">
                <div className="card p-8 h-full hover:-translate-y-1">
                  {/* Step number */}
                  <div className="absolute top-6 right-6 text-5xl font-bold text-dark-100 group-hover:text-dark-200 transition-colors">
                    {feature.step}
                  </div>

                  {/* Icon */}
                  <div className={`w-14 h-14 ${feature.bgColor} rounded-2xl flex items-center justify-center mb-6`}>
                    <feature.icon className={`w-7 h-7 bg-gradient-to-r ${feature.color} bg-clip-text`} style={{ color: feature.color.includes('primary') ? '#a855f7' : feature.color.includes('purple') ? '#8b5cf6' : '#10b981' }} />
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-semibold text-dark-900 mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-dark-500 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { value: '50K+', label: 'Contacts Analyzed' },
              { value: '2.5K+', label: 'VCs Discovered' },
              { value: '89%', label: 'Categorization Accuracy' },
              { value: '4.2x', label: 'Faster Outreach' },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl md:text-5xl font-bold gradient-text mb-2">{stat.value}</div>
                <div className="text-dark-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-dark-900 via-dark-900 to-primary-900" />
        <div className="absolute inset-0 bg-mesh opacity-50" />

        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Ready to unlock your network?
          </h2>
          <p className="text-xl text-dark-300 mb-10 max-w-2xl mx-auto">
            Start for free. Invite your team. Discover hidden opportunities in your collective network.
          </p>
          <Link href="/login" className="inline-flex items-center gap-2 px-8 py-4 bg-white text-dark-900 rounded-xl font-semibold text-lg hover:bg-dark-100 transition-all duration-200 shadow-xl hover:shadow-2xl hover:-translate-y-0.5">
            Get Started Free
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-dark-950 border-t border-dark-800 py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
                <Users className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-semibold text-white">Relationship Intel</span>
            </div>
            <div className="text-dark-400 text-sm">
              Built with Next.js, Supabase, and Claude AI
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

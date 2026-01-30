import Link from 'next/link';
import { ArrowRight, Users, Sparkles, Target } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary-600 to-primary-800 text-white">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center">
            <h1 className="text-5xl font-bold mb-6">
              Relationship Intel
            </h1>
            <p className="text-xl text-primary-100 mb-8 max-w-2xl mx-auto">
              Turn your network into a powerful sales and fundraising machine.
              Connect your LinkedIn, Gmail, and Calendar to discover VCs, angels, and prospects hiding in your connections.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-white text-primary-700 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-primary-50 transition-colors"
            >
              Get Started <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">
          How It Works
        </h2>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100">
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-primary-600" />
            </div>
            <h3 className="text-xl font-semibold mb-3 text-gray-900">
              1. Connect Your Network
            </h3>
            <p className="text-gray-600">
              Import your LinkedIn connections via CSV, then connect your Gmail and Google Calendar to track interactions.
            </p>
          </div>

          <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="text-xl font-semibold mb-3 text-gray-900">
              2. Enrich & Score
            </h3>
            <p className="text-gray-600">
              We pull full work history from People Data Labs and calculate proximity scores based on your interaction history.
            </p>
          </div>

          <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <Target className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold mb-3 text-gray-900">
              3. Categorize & Act
            </h3>
            <p className="text-gray-600">
              Contacts are auto-categorized as VCs, Angels, Sales Prospects, or Irrelevant using rules and AI. Focus on who matters.
            </p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-gray-50 border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl font-bold mb-4 text-gray-900">
            Ready to unlock your network&apos;s potential?
          </h2>
          <p className="text-gray-600 mb-8">
            Start for free. No credit card required.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-primary-600 text-white px-8 py-4 rounded-lg font-semibold hover:bg-primary-700 transition-colors"
          >
            Start Now <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-gray-500 text-sm">
          Built with Next.js, Supabase, and People Data Labs
        </div>
      </footer>
    </main>
  );
}

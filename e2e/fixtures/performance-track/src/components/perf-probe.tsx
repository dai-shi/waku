import { type ReactNode, Suspense } from 'react';

type SlowProps = { delay: number; children: ReactNode };

// The span name in the performance track is the component function's name, so
// Home and About use differently-named components. That lets each phase of the
// e2e assert on its own route's spans and never be satisfied by the other's.
async function HomeSlowServerComponent({ delay, children }: SlowProps) {
  await new Promise((resolve) => setTimeout(resolve, delay));
  return children;
}

async function AboutSlowServerComponent({ delay, children }: SlowProps) {
  await new Promise((resolve) => setTimeout(resolve, delay));
  return children;
}

// Nesting the slow component makes a sequential waterfall (300ms, then 500ms)
// that shows as a staircase in the "Server Components" track.
export function HomePerfProbe() {
  return (
    <section>
      <h2>Nested Suspense</h2>
      <Suspense key="/" fallback={<p>Loading...</p>}>
        <HomeSlowServerComponent delay={300}>
          <p>HomeSlowServerComponent resolved after 300ms</p>
          <section>
            <Suspense fallback={<p>Loading...</p>}>
              <HomeSlowServerComponent delay={500}>
                <p>HomeSlowServerComponent resolved after 500ms</p>
              </HomeSlowServerComponent>
            </Suspense>
          </section>
        </HomeSlowServerComponent>
      </Suspense>
    </section>
  );
}

export function AboutPerfProbe() {
  return (
    <section>
      <h2>Nested Suspense</h2>
      <Suspense key="/about" fallback={<p>Loading...</p>}>
        <AboutSlowServerComponent delay={300}>
          <p>AboutSlowServerComponent resolved after 300ms</p>
          <section>
            <Suspense fallback={<p>Loading...</p>}>
              <AboutSlowServerComponent delay={500}>
                <p>AboutSlowServerComponent resolved after 500ms</p>
              </AboutSlowServerComponent>
            </Suspense>
          </section>
        </AboutSlowServerComponent>
      </Suspense>
    </section>
  );
}

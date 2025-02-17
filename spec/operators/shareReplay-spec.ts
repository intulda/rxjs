import { expect } from 'chai';
import * as sinon from 'sinon';
import { hot, cold, expectObservable, expectSubscriptions } from '../helpers/marble-testing';
import { shareReplay, mergeMapTo, retry, take } from 'rxjs/operators';
import { TestScheduler } from 'rxjs/testing';
import { Observable, Operator, Observer, of, from, defer } from 'rxjs';

declare const rxTestScheduler: TestScheduler;

/** @test {shareReplay} */
describe('shareReplay operator', () => {
  it('should mirror a simple source Observable', () => {
    const source = cold('--1-2---3-4--5-|');
    const sourceSubs =  '^              !';
    const published = source.pipe(shareReplay());
    const expected =    '--1-2---3-4--5-|';

    expectObservable(published).toBe(expected);
    expectSubscriptions(source.subscriptions).toBe(sourceSubs);
  });

  it('should do nothing if result is not subscribed', () => {
    let subscribed = false;
    const source = new Observable(() => {
      subscribed = true;
    });
    source.pipe(shareReplay());
    expect(subscribed).to.be.false;
  });

  it('should multicast the same values to multiple observers, bufferSize=1', () => {
    const source =     cold('-1-2-3----4-|'); const shared = source.pipe(shareReplay(1));
    const sourceSubs =      '^           !';
    const subscriber1 = hot('a|           ').pipe(mergeMapTo(shared));
    const expected1   =     '-1-2-3----4-|';
    const subscriber2 = hot('    b|       ').pipe(mergeMapTo(shared));
    const expected2   =     '    23----4-|';
    const subscriber3 = hot('        c|   ').pipe(mergeMapTo(shared));
    const expected3   =     '        3-4-|';

    expectObservable(subscriber1).toBe(expected1);
    expectObservable(subscriber2).toBe(expected2);
    expectObservable(subscriber3).toBe(expected3);
    expectSubscriptions(source.subscriptions).toBe(sourceSubs);
  });

  it('should multicast the same values to multiple observers, bufferSize=2', () => {
    const source =     cold('-1-2-----3------4-|'); const shared = source.pipe(shareReplay(2));
    const sourceSubs =      '^                 !';
    const subscriber1 = hot('a|                 ').pipe(mergeMapTo(shared));
    const expected1   =     '-1-2-----3------4-|';
    const subscriber2 = hot('    b|             ').pipe(mergeMapTo(shared));
    const expected2   =     '    (12)-3------4-|';
    const subscriber3 = hot('           c|       ').pipe(mergeMapTo(shared));
    const expected3   =     '           (23)-4-|';

    expectObservable(subscriber1).toBe(expected1);
    expectObservable(subscriber2).toBe(expected2);
    expectObservable(subscriber3).toBe(expected3);
    expectSubscriptions(source.subscriptions).toBe(sourceSubs);
  });

  it('should multicast an error from the source to multiple observers', () => {
    const source =     cold('-1-2-3----4-#'); const shared = source.pipe(shareReplay(1));
    const sourceSubs =      '^           !';
    const subscriber1 = hot('a|           ').pipe(mergeMapTo(shared));
    const expected1   =     '-1-2-3----4-#';
    const subscriber2 = hot('    b|       ').pipe(mergeMapTo(shared));
    const expected2   =     '    23----4-#';
    const subscriber3 = hot('        c|   ').pipe(mergeMapTo(shared));
    const expected3   =     '        3-4-#';

    expectObservable(subscriber1).toBe(expected1);
    expectObservable(subscriber2).toBe(expected2);
    expectObservable(subscriber3).toBe(expected3);
    expectSubscriptions(source.subscriptions).toBe(sourceSubs);
  });

  it('should multicast an empty source', () => {
    const source = cold('|');
    const sourceSubs =  '(^!)';
    const shared = source.pipe(shareReplay(1));
    const expected =    '|';

    expectObservable(shared).toBe(expected);
    expectSubscriptions(source.subscriptions).toBe(sourceSubs);
  });

  it('should multicast a never source', () => {
    const source = cold('-');
    const sourceSubs =  '^';

    const shared = source.pipe(shareReplay(1));
    const expected =    '-';

    expectObservable(shared).toBe(expected);
    expectSubscriptions(source.subscriptions).toBe(sourceSubs);
  });

  it('should multicast a throw source', () => {
    const source = cold('#');
    const sourceSubs =  '(^!)';
    const shared = source.pipe(shareReplay(1));
    const expected =    '#';

    expectObservable(shared).toBe(expected);
    expectSubscriptions(source.subscriptions).toBe(sourceSubs);
  });

  it('should replay results to subsequent subscriptions if source completes, bufferSize=2', () => {
    const source =     cold('-1-2-----3-|        ');
    const shared = source.pipe(shareReplay(2));
    const sourceSubs =      '^          !        ';
    const subscriber1 = hot('a|                  ').pipe(mergeMapTo(shared));
    const expected1   =     '-1-2-----3-|        ';
    const subscriber2 = hot('    b|              ').pipe(mergeMapTo(shared));
    const expected2   =     '    (12)-3-|        ';
    const subscriber3 = hot('               (c|) ').pipe(mergeMapTo(shared));
    const expected3   =     '               (23|)';

    expectObservable(subscriber1).toBe(expected1);
    expectObservable(subscriber2).toBe(expected2);
    expectObservable(subscriber3).toBe(expected3);
    expectSubscriptions(source.subscriptions).toBe(sourceSubs);
  });

  it('should completely restart for subsequent subscriptions if source errors, bufferSize=2', () => {
    const source =     cold('-1-2-----3-#               ');
    const shared = source.pipe(shareReplay(2));
    const sourceSubs1 =     '^          !               ';
    const subscriber1 = hot('a|                         ').pipe(mergeMapTo(shared));
    const expected1   =     '-1-2-----3-#               ';
    const subscriber2 = hot('    b|                     ').pipe(mergeMapTo(shared));
    const expected2   =     '    (12)-3-#               ';
    const subscriber3 = hot('               (c|)        ').pipe(mergeMapTo(shared));
    const expected3   =     '               -1-2-----3-#';
    const sourceSubs2 =     '               ^          !';

    expectObservable(subscriber1).toBe(expected1);
    expectObservable(subscriber2).toBe(expected2);
    expectObservable(subscriber3).toBe(expected3);
    expectSubscriptions(source.subscriptions).toBe([sourceSubs1, sourceSubs2]);
  });

  it('should be retryable, bufferSize=2', () => {
    const subs = [];
    const source =     cold('-1-2-----3-#                      ');
    const shared = source.pipe(shareReplay(2), retry(1));
    subs.push(              '^          !                      ');
    subs.push(              '           ^          !           ');
    subs.push(              '                      ^          !');
    const subscriber1 = hot('a|                                ').pipe(mergeMapTo(shared));
    const expected1   =     '-1-2-----3--1-2-----3-#           ';
    const subscriber2 = hot('    b|                            ').pipe(mergeMapTo(shared));
    const expected2   =     '    (12)-3--1-2-----3-#           ';
    const subscriber3 = hot('               (c|)               ').pipe(mergeMapTo(shared));
    const expected3   =     '               (12)-3--1-2-----3-#';

    expectObservable(subscriber1).toBe(expected1);
    expectObservable(subscriber2).toBe(expected2);
    expectObservable(subscriber3).toBe(expected3);
    expectSubscriptions(source.subscriptions).toBe(subs);
  });

  it('when no windowTime is given ReplaySubject should be in _infiniteTimeWindow mode', () => {
    const spy = sinon.spy(rxTestScheduler, 'now');

    of(1)
      .pipe(shareReplay(1, undefined, rxTestScheduler))
      .subscribe();
    spy.restore();
    expect(spy, 'ReplaySubject should not call scheduler.now() when no windowTime is given').to.be.not.called;
  });

  it('should not restart due to unsubscriptions if refCount is false', () => {
    const source = cold('a-b-c-d-e-f-g-h-i-j');
    const sourceSubs =  '^------------------';
    const sub1 =        '^------!';
    const expected1 =   'a-b-c-d-';
    const sub2 =        '-----------^-------';
    const expected2 =   '-----------fg-h-i-j';

    const shared = source.pipe(shareReplay({ bufferSize: 1, refCount: false }));

    expectObservable(shared, sub1).toBe(expected1);
    expectObservable(shared, sub2).toBe(expected2);
    expectSubscriptions(source.subscriptions).toBe(sourceSubs);
  });

  it('should restart due to unsubscriptions if refCount is true', () => {
    const sourceSubs = [];
    const source = cold('a-b-c-d-e-f-g-h-i-j');
    sourceSubs.push(    '^------!----------------------');
    sourceSubs.push(    '-----------^------------------');
    const sub1 =        '^------!';
    const expected1 =   'a-b-c-d-';
    const sub2 =        '-----------^------------------';
    const expected2 =   '-----------a-b-c-d-e-f-g-h-i-j';

    const shared = source.pipe(shareReplay({ bufferSize: 1, refCount: true }));

    expectObservable(shared, sub1).toBe(expected1);
    expectObservable(shared, sub2).toBe(expected2);
    expectSubscriptions(source.subscriptions).toBe(sourceSubs);
  });

  it('should not restart due to unsubscriptions if refCount is true when the source has completed', () => {
    const source = cold('a-(b|)         ');
    const sourceSubs =  '^-!            ';
    const sub1 =        '^------!       ';
    const expected1 =   'a-(b|)         ';
    const sub2 =        '-----------^!  ';
    const expected2 =   '-----------(b|)';

    const shared = source.pipe(shareReplay({ bufferSize: 1, refCount: true }));

    expectObservable(shared, sub1).toBe(expected1);
    expectObservable(shared, sub2).toBe(expected2);
    expectSubscriptions(source.subscriptions).toBe(sourceSubs);
  });

  it('should not restart a synchronous source due to unsubscriptions if refCount is true when the source has completed', () => {
    // The test above this one doesn't actually test completely synchronous
    // behaviour because of this problem:
    // https://github.com/ReactiveX/rxjs/issues/5523

    let subscriptions = 0;
    const source = defer(() => {
      ++subscriptions;
      return of(42);
    }).pipe(shareReplay({ bufferSize: 1, refCount: true }));
    source.subscribe();
    source.subscribe();
    expect(subscriptions).to.equal(1);
  });

  it('should default to refCount being false', () => {
    const source = cold('a-b-c-d-e-f-g-h-i-j');
    const sourceSubs =  '^------------------';
    const sub1 =        '^------!';
    const expected1 =   'a-b-c-d-';
    const sub2 =        '-----------^-------';
    const expected2 =   '-----------fg-h-i-j';

    const shared = source.pipe(shareReplay(1));

    expectObservable(shared, sub1).toBe(expected1);
    expectObservable(shared, sub2).toBe(expected2);
    expectSubscriptions(source.subscriptions).toBe(sourceSubs);
  });

  it('should not break lift() composability', (done) => {
    class MyCustomObservable<T> extends Observable<T> {
      lift<R>(operator: Operator<T, R>): Observable<R> {
        const observable = new MyCustomObservable<R>();
        (<any>observable).source = this;
        (<any>observable).operator = operator;
        return observable;
      }
    }

    const result = new MyCustomObservable((observer: Observer<number>) => {
      observer.next(1);
      observer.next(2);
      observer.next(3);
      observer.complete();
    }).pipe(shareReplay());

    expect(result instanceof MyCustomObservable).to.be.true;

    const expected = [1, 2, 3];

    result
      .subscribe((n: any) => {
        expect(expected.length).to.be.greaterThan(0);
        expect(n).to.equal(expected.shift());
      }, (x) => {
        done(new Error('should not be called'));
      }, () => {
        done();
      });
  });

  it('should not skip values on a sync source', () => {
    const a = from(['a', 'b', 'c', 'd']);
    // We would like for the previous line to read like this:
    //
    // const a = cold('(abcd|)');
    //
    // However, that would synchronously emit multiple values at frame 0,
    // but it's not synchronous upon-subscription.
    // TODO: revisit once https://github.com/ReactiveX/rxjs/issues/5523 is fixed

    const x = cold(  'x-------x');
    const expected = '(abcd)--d';

    const shared = a.pipe(shareReplay(1));
    const result = x.pipe(mergeMapTo(shared));
    expectObservable(result).toBe(expected);
  });

  // TODO: fix firehose unsubscription
  it.skip('should stop listening to a synchronous observable when unsubscribed', () => {
    const sideEffects: number[] = [];
    const synchronousObservable = new Observable<number>(subscriber => {
      // This will check to see if the subscriber was closed on each loop
      // when the unsubscribe hits (from the `take`), it should be closed
      for (let i = 0; !subscriber.closed && i < 10; i++) {
        sideEffects.push(i);
        subscriber.next(i);
      }
    });

    synchronousObservable.pipe(
      shareReplay(),
      take(3),
    ).subscribe(() => { /* noop */ });

    expect(sideEffects).to.deep.equal([0, 1, 2]);
  });

  const FinalizationRegistry = (global as any).FinalizationRegistry;
  if (FinalizationRegistry) {

    it('should not leak the subscriber for sync sources', (done) => {
      let callback: (() => void) | undefined = () => { /* noop */ };

      const registry = new FinalizationRegistry((value: any) => {
        expect(value).to.equal('callback');
        done();
      });
      registry.register(callback, 'callback');

      const shared = of(42).pipe(shareReplay(1));
      shared.subscribe(callback);

      callback = undefined;
      global.gc();
    });

  } else {
    console.warn(`No support for FinalizationRegistry in Node ${process.version}`);
  }

});
